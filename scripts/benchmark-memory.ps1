param(
  [string]$Executable = (Join-Path $PSScriptRoot '..\src-tauri\target\release\netmask.exe'),
  [string]$Output = (Join-Path $PSScriptRoot '..\.tmp\native-memory.json'),
  [int]$SamplesPerPhase = 30
)
$ErrorActionPreference = 'Stop'
if ($SamplesPerPhase -lt 10 -or $SamplesPerPhase -gt 120) { throw 'Use 10-120 samples per phase.' }
$Executable = (Resolve-Path -LiteralPath $Executable).Path
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class NetMaskMemoryProbe {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct Entry { public uint size, usage, id; public UIntPtr heap; public uint module, threads, parent; public int priority; public uint flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string name; }
  [StructLayout(LayoutKind.Sequential)]
  struct Counters { public uint size, faults; public UIntPtr peakWorkingSet, workingSet, peakPaged, paged, peakNonpaged, nonpaged, pagefile, peakPagefile, privateUsage; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint id);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool Process32FirstW(IntPtr handle, ref Entry entry);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool Process32NextW(IntPtr handle, ref Entry entry);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint id);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("psapi.dll", SetLastError=true)] static extern bool GetProcessMemoryInfo(IntPtr handle, ref Counters info, uint size);
  [DllImport("psapi.dll", SetLastError=true)] static extern bool QueryWorkingSet(IntPtr handle, IntPtr buffer, uint size);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr window, uint message, UIntPtr wparam, IntPtr lparam);
  public sealed class Reading { public uint id, parent; public string role; public ulong privateWorkingSetBytes, workingSetBytes, privateCommitBytes; }
  public static Reading SampleOne(uint id, uint parent, string role) {
      var handle = OpenProcess(0x410, false, id);
      if (handle == IntPtr.Zero) throw new Exception("A benchmark process could not be measured");
      try {
        var info = new Counters(); info.size = (uint)Marshal.SizeOf(typeof(Counters));
        if (!GetProcessMemoryInfo(handle, ref info, info.size)) throw new Exception("Cannot read process memory counters");
        ulong pages = 0; bool captured = false;
        for (int size = 1024 * 1024; size <= 16 * 1024 * 1024; size *= 2) {
          var buffer = Marshal.AllocHGlobal(size);
          try {
            if (!QueryWorkingSet(handle, buffer, (uint)size)) continue;
            var count = (ulong)Marshal.ReadIntPtr(buffer).ToInt64();
            if (count > (ulong)(size / IntPtr.Size - 1)) throw new Exception("Invalid working-set count");
            for (ulong index = 0; index < count; index++) {
              var block = (ulong)Marshal.ReadIntPtr(buffer, checked((int)((index + 1) * (ulong)IntPtr.Size))).ToInt64();
              if ((block & 0x100) == 0) pages++;
            }
            captured = true; break;
          } finally { Marshal.FreeHGlobal(buffer); }
        }
        if (!captured) throw new Exception("Cannot measure private resident pages");
        return new Reading { id=id, parent=parent, role=role, privateWorkingSetBytes=pages*(ulong)Environment.SystemPageSize, workingSetBytes=info.workingSet.ToUInt64(), privateCommitBytes=info.privateUsage.ToUInt64() };
      } finally { CloseHandle(handle); }
  }
}
'@
function Get-Median($Values) {
  $sorted = @($Values | Sort-Object)
  if ($sorted.Count % 2) { return $sorted[[int][Math]::Floor($sorted.Count / 2)] }
  return ($sorted[$sorted.Count / 2 - 1] + $sorted[$sorted.Count / 2]) / 2
}
function Get-Summary($Rows) {
  $summary = [ordered]@{}
  foreach ($metric in @('privateWorkingSetBytes', 'workingSetBytes', 'privateCommitBytes')) {
    $values = @($Rows | ForEach-Object { ($_.$metric) })
    $summary[$metric] = @{median=(Get-Median $values);min=($values | Measure-Object -Minimum).Minimum;max=($values | Measure-Object -Maximum).Maximum}
  }
  return $summary
}
function Get-NetMaskProcessTree([int]$RootId) {
  $processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name)
  $ids = [Collections.Generic.HashSet[uint32]]::new()
  $ids.Add([uint32]$RootId) | Out-Null
  do {
    $changed = $false
    foreach ($process in $processes) {
      if ($ids.Contains([uint32]$process.ParentProcessId) -and $ids.Add([uint32]$process.ProcessId)) { $changed = $true }
    }
  } while ($changed)
  $tree = @($processes | Where-Object { $ids.Contains([uint32]$_.ProcessId) })
  if (-not ($tree | Where-Object ProcessId -eq $RootId)) { throw 'Benchmark app exited' }
  return $tree
}
$taskDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('netmask-memory-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskDirectory | Out-Null
$preferences = @{minimizeToTray=$false;launchOnStartup=$false;autoRefreshInterval=0;theme='light';showEthernet=$true;ultraLowMemory=$false;autoCloakStreamer=$false;streamerMaskName='Private network';bssidCloaking=$true;bssidMaskMode='partial';silentElevation=$false;shortcuts=@{}}
[System.IO.File]::WriteAllText((Join-Path $taskDirectory 'settings.json'), ($preferences | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
$previousDirectory = $env:NETMASK_DATA_DIR
$previousWebViewDirectory = $env:WEBVIEW2_USER_DATA_FOLDER
$app = $null
try {
  $env:NETMASK_DATA_DIR = $taskDirectory
  $env:WEBVIEW2_USER_DATA_FOLDER = (Join-Path $taskDirectory 'webview')
  $started = [DateTimeOffset]::UtcNow
  $app = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path $Executable) -PassThru
  $env:NETMASK_DATA_DIR = $previousDirectory
  $env:WEBVIEW2_USER_DATA_FOLDER = $previousWebViewDirectory
  $deadline = (Get-Date).AddSeconds(30)
  do { Start-Sleep -Milliseconds 200; $app.Refresh(); if ($app.HasExited) { throw 'The benchmark app did not start.' } } while ($app.MainWindowHandle -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline)
  if ($app.MainWindowHandle -eq [IntPtr]::Zero) { throw 'The benchmark window is unavailable.' }
  $window = $app.MainWindowHandle
  [NetMaskMemoryProbe]::ShowWindow($window, 5) | Out-Null
  Write-Output 'Measuring the production app with isolated settings; network mutations and memory trimming are disabled.'
  $phases = @()
  foreach ($phase in @(@{name='visible';settle=30;window=5},@{name='hidden-in-tray';settle=60;window=0})) {
    [NetMaskMemoryProbe]::ShowWindow($window, $phase.window) | Out-Null
    Write-Output ('Settling ' + $phase.name + ' for ' + $phase.settle + ' seconds.')
    Start-Sleep -Seconds $phase.settle
    $rows = @()
    for ($index=0; $index -lt $SamplesPerPhase; $index++) {
      $readings = @(Get-NetMaskProcessTree $app.Id | ForEach-Object {
        $role = if ($_.ProcessId -eq $app.Id) { 'host' } elseif ($_.Name -ieq 'msedgewebview2.exe') { 'webview' } else { 'command' }
        [NetMaskMemoryProbe]::SampleOne([uint32]$_.ProcessId, [uint32]$_.ParentProcessId, $role)
      })
      $totals = @{privateWorkingSetBytes=0L;workingSetBytes=0L;privateCommitBytes=0L}
      foreach ($reading in $readings) { foreach ($metric in @('privateWorkingSetBytes','workingSetBytes','privateCommitBytes')) { $totals[$metric] += [long]$reading.$metric } }
      $rows += [pscustomobject]@{at=[DateTimeOffset]::UtcNow.ToString('o');processes=$readings;privateWorkingSetBytes=$totals.privateWorkingSetBytes;workingSetBytes=$totals.workingSetBytes;privateCommitBytes=$totals.privateCommitBytes}
      Start-Sleep -Seconds 1
    }
    $summary = Get-Summary $rows
    $hostRows = @($rows | ForEach-Object { $_.processes | Where-Object role -eq 'host' })
    $webviewRows = @($rows | ForEach-Object { $values = $_.processes | Where-Object role -eq 'webview'; [pscustomobject]@{privateWorkingSetBytes=($values | Measure-Object privateWorkingSetBytes -Sum).Sum;workingSetBytes=($values | Measure-Object workingSetBytes -Sum).Sum;privateCommitBytes=($values | Measure-Object privateCommitBytes -Sum).Sum} })
    $phases += @{name=$phase.name;settlingSeconds=$phase.settle;samples=$rows;summary=$summary;hostSummary=(Get-Summary $hostRows);webviewSummary=(Get-Summary $webviewRows)}
    Write-Output ($phase.name + ': median private resident memory ' + [Math]::Round($summary.privateWorkingSetBytes.median / 1MB, 1) + ' MiB across NetMask and its children.')
  }
  $os = Get-CimInstance Win32_OperatingSystem
  $processor = Get-CimInstance Win32_Processor | Select-Object -First 1
  $pkg = Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json
  $runtime = Get-ChildItem 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application' -Directory -ErrorAction SilentlyContinue | Where-Object Name -Match '^\d+\.' | Sort-Object Name -Descending | Select-Object -First 1
  $report = @{version=$pkg.version;sourceCommit=(git -C (Join-Path $PSScriptRoot '..') rev-parse HEAD);worktreeDirty=[bool](git -C (Join-Path $PSScriptRoot '..') status --porcelain);binarySha256=(Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLower();startedAt=$started.ToString('o');completedAt=[DateTimeOffset]::UtcNow.ToString('o');platform=@{os=$os.Caption;build=$os.BuildNumber;cpu=$processor.Name;ramBytes=[long]$os.TotalVisibleMemorySize*1KB;webview2=$runtime.Name};method=@{samplesPerPhase=$SamplesPerPhase;intervalSeconds=1;privateWorkingSet='QueryWorkingSet resident pages with the Shared bit unset, summed across the host and descendants';privateCommit='GetProcessMemoryInfo PrivateUsage; committed private bytes, including nonresident pages';workingSet='GetProcessMemoryInfo WorkingSetSize; shared pages may be counted more than once';settings='Isolated NetMask settings and WebView2 data, Paper theme, automation disabled, no explicit memory trim';workload='Actual local saved networks and visible telemetry; no explicit speed test or update download';units='bytes; displayed MiB = bytes / 1048576'};phases=$phases}
  $resolvedOutput = [System.IO.Path]::GetFullPath($Output)
  New-Item -ItemType Directory -Path (Split-Path $resolvedOutput) -Force | Out-Null
  [System.IO.File]::WriteAllText($resolvedOutput, ($report | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($false))
  Write-Output ('Saved raw benchmark to ' + $resolvedOutput)
} finally {
  $env:NETMASK_DATA_DIR = $previousDirectory
  $env:WEBVIEW2_USER_DATA_FOLDER = $previousWebViewDirectory
  if ($app -and -not $app.HasExited) {
    $app.Refresh()
    if ($app.MainWindowHandle -ne [IntPtr]::Zero) { [NetMaskMemoryProbe]::PostMessageW($app.MainWindowHandle, 0x10, [UIntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
    if (-not $app.WaitForExit(10000)) { $app.Kill() }
  }
  # Retain the isolated settings directory for reproducibility; never alter user data.
}
