param(
  [string]$Executable = (Join-Path $PSScriptRoot '..\src-tauri\target\release\netmask.exe'),
  [string]$Output = (Join-Path $PSScriptRoot '..\.tmp\native-memory.json'),
  [int]$SamplesPerPhase = 15,
  [ValidateSet('off', 'on')][string]$MonitoringMode = 'off',
  [int]$ActivitySeconds = 600,
  [string]$BinarySource = 'working tree',
  [string]$SourceCommit = ''
)
$ErrorActionPreference = 'Stop'
if ($SamplesPerPhase -lt 10 -or $SamplesPerPhase -gt 120) { throw 'Use 10-120 samples per phase.' }
if ($ActivitySeconds -lt 60 -or $ActivitySeconds -gt 3600) { throw 'Use 60-3600 seconds for activity observation.' }
$Executable = (Resolve-Path -LiteralPath $Executable).Path
$loaderPath = Join-Path (Split-Path $Executable) 'WebView2Loader.dll'
if (-not (Test-Path -LiteralPath $loaderPath)) { throw 'WebView2Loader.dll must be beside the benchmark executable.' }
$closeHelper = Join-Path $PSScriptRoot 'benchmark-close-to-tray.cjs'
if (-not (Test-Path -LiteralPath $closeHelper)) { throw 'The close-to-tray benchmark helper is missing.' }
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
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr window, uint message, UIntPtr wparam, IntPtr lparam);
  [StructLayout(LayoutKind.Sequential)] public struct IoCounters { public ulong readOperations, writeOperations, otherOperations, readBytes, writeBytes, otherBytes; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessIoCounters(IntPtr handle, out IoCounters counters);
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
  public static IoCounters SampleIo(uint id) {
    var handle = OpenProcess(0x410, false, id);
    if (handle == IntPtr.Zero) throw new Exception("A benchmark process could not be measured");
    try { IoCounters counters; if (!GetProcessIoCounters(handle, out counters)) throw new Exception("Cannot read process I/O counters"); return counters; }
    finally { CloseHandle(handle); }
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
function Get-ActivitySnapshot([int]$RootId) {
  $cpu = 0.0
  [uint64]$writeOperations = 0
  [uint64]$writeBytes = 0
  foreach ($process in (Get-NetMaskProcessTree $RootId)) {
    $live = Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
    if ($live) {
      try {
        if ($null -ne $live.CPU) { $cpu += [double]$live.CPU }
        $io = [NetMaskMemoryProbe]::SampleIo([uint32]$process.ProcessId)
        $writeOperations += $io.writeOperations
        $writeBytes += $io.writeBytes
      } catch {
        if ($process.ProcessId -eq $RootId) { throw }
      }
    }
  }
  return [pscustomobject]@{at=[DateTimeOffset]::UtcNow.ToString('o');cpuSeconds=$cpu;writeOperations=$writeOperations;writeBytes=$writeBytes}
}
function Get-MemoryReadings([int]$RootId) {
  $readings = @()
  foreach ($process in (Get-NetMaskProcessTree $RootId)) {
    $role = if ($process.ProcessId -eq $RootId) { 'host' } elseif ($process.Name -ieq 'msedgewebview2.exe') { 'webview' } else { 'command' }
    try {
      $readings += [NetMaskMemoryProbe]::SampleOne([uint32]$process.ProcessId, [uint32]$process.ParentProcessId, $role)
    } catch {
      if ($process.ProcessId -eq $RootId) { throw }
    }
  }
  return $readings
}
function Wait-ForVisibleWindow($App, [int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    Start-Sleep -Milliseconds 100
    $App.Refresh()
    if ($App.HasExited) { throw 'The benchmark app exited while waiting for its window.' }
    if ($App.MainWindowHandle -ne [IntPtr]::Zero -and [NetMaskMemoryProbe]::IsWindowVisible($App.MainWindowHandle)) { return $App.MainWindowHandle }
  } while ((Get-Date) -lt $deadline)
  throw 'The benchmark window did not become visible.'
}
function Start-Activation($Executable, $TaskDirectory) {
  $savedData = $env:NETMASK_DATA_DIR
  $savedWebView = $env:WEBVIEW2_USER_DATA_FOLDER
  try {
    $env:NETMASK_DATA_DIR = $TaskDirectory
    $env:WEBVIEW2_USER_DATA_FOLDER = (Join-Path $TaskDirectory 'webview')
    return Start-Process -FilePath $Executable -WorkingDirectory (Split-Path $Executable) -PassThru -WindowStyle Hidden
  } finally {
    $env:NETMASK_DATA_DIR = $savedData
    $env:WEBVIEW2_USER_DATA_FOLDER = $savedWebView
  }
}
$taskDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('netmask-memory-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskDirectory | Out-Null
$monitoringEnabled = $MonitoringMode -eq 'on'
$preferences = @{onboardingCompleted=$true;minimizeToTray=$true;launchOnStartup=$false;autoRefreshInterval=0;theme='light';showEthernet=$true;ultraLowMemory=$false;autoCloakStreamer=$false;streamerDetectionMode='off';streamerMaskName='Private network';customBroadcastApps=@();suppressedBroadcastApps=@();sharingTimerMinutes=30;monitoringEnabled=$monitoringEnabled;monitoringPaused=$false;historyRetentionDays=30;usageTrackingEnabled=$monitoringEnabled;contextPromptsEnabled=$false;networkChangeAlerts=$false;behaviorChangeAlerts=$false;usageLimitAlerts=$false;bssidCloaking=$true;bssidMaskMode='partial';silentElevation=$false;shortcuts=@{}}
[System.IO.File]::WriteAllText((Join-Path $taskDirectory 'settings.json'), ($preferences | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $taskDirectory 'ui-state.json'), (@{activeView='journal';journalTab='week';historyRange='7d';selectedGuid=$null;mainScrollTop=0} | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
$previousDirectory = $env:NETMASK_DATA_DIR
$previousWebViewDirectory = $env:WEBVIEW2_USER_DATA_FOLDER
$previousWebViewArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$app = $null
try {
  $debugListener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $debugListener.Start()
  $debugPort = ([Net.IPEndPoint]$debugListener.LocalEndpoint).Port
  $debugListener.Stop()
  $env:NETMASK_DATA_DIR = $taskDirectory
  $env:WEBVIEW2_USER_DATA_FOLDER = (Join-Path $taskDirectory 'webview')
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = (($previousWebViewArguments + ' --remote-debugging-port=' + $debugPort).Trim())
  $started = [DateTimeOffset]::UtcNow
  $app = Start-Process -FilePath $Executable -WorkingDirectory (Split-Path $Executable) -PassThru
  $env:NETMASK_DATA_DIR = $previousDirectory
  $env:WEBVIEW2_USER_DATA_FOLDER = $previousWebViewDirectory
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousWebViewArguments
  $window = Wait-ForVisibleWindow $app 30
  Write-Output 'Measuring the production app with isolated settings; network mutations are disabled and the built-in tray memory policy remains active.'
  $phases = @()
  foreach ($phase in @(@{name='visible';settle=30},@{name='hidden-in-tray';settle=60})) {
    if ($phase.name -eq 'hidden-in-tray') {
      & node $closeHelper $debugPort | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Cannot invoke NetMask''s close-to-tray action.' }
      Start-Sleep -Seconds 3
      $app.Refresh()
      if ($app.HasExited) { throw 'The benchmark app exited instead of remaining in the tray.' }
    }
    Write-Output ('Settling ' + $phase.name + ' for ' + $phase.settle + ' seconds.')
    Start-Sleep -Seconds $phase.settle
    $rows = @()
    for ($index=0; $index -lt $SamplesPerPhase; $index++) {
      $readings = @(Get-MemoryReadings $app.Id)
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
  Write-Output ('Observing hidden CPU and writes for ' + $ActivitySeconds + ' seconds with monitoring ' + $MonitoringMode + '.')
  $activityStart = Get-ActivitySnapshot $app.Id
  $databasePath = Join-Path $taskDirectory 'observations.sqlite3'
  $databaseBytesBefore = if (Test-Path -LiteralPath $databasePath) { (Get-Item -LiteralPath $databasePath).Length } else { 0 }
  Start-Sleep -Seconds $ActivitySeconds
  $activityEnd = Get-ActivitySnapshot $app.Id
  $databaseBytesAfter = if (Test-Path -LiteralPath $databasePath) { (Get-Item -LiteralPath $databasePath).Length } else { 0 }
  $activity = @{durationSeconds=$ActivitySeconds;cpuSeconds=[Math]::Max(0, $activityEnd.cpuSeconds-$activityStart.cpuSeconds);writeOperations=[Math]::Max(0, [int64]$activityEnd.writeOperations-[int64]$activityStart.writeOperations);writeBytes=[Math]::Max(0, [int64]$activityEnd.writeBytes-[int64]$activityStart.writeBytes);databaseBytesBefore=$databaseBytesBefore;databaseBytesAfter=$databaseBytesAfter;start=$activityStart;end=$activityEnd}
  $restoreWatch = [Diagnostics.Stopwatch]::StartNew()
  $activation = Start-Activation $Executable $taskDirectory
  if (-not $activation.WaitForExit(30000)) { $activation.Kill(); throw 'The activation process did not hand off to the tray instance.' }
  $window = Wait-ForVisibleWindow $app 30
  $restoreWatch.Stop()
  Start-Sleep -Seconds 30
  $rows = @()
  for ($index=0; $index -lt $SamplesPerPhase; $index++) {
    $readings = @(Get-MemoryReadings $app.Id)
    $totals = @{privateWorkingSetBytes=0L;workingSetBytes=0L;privateCommitBytes=0L}
    foreach ($reading in $readings) { foreach ($metric in @('privateWorkingSetBytes','workingSetBytes','privateCommitBytes')) { $totals[$metric] += [long]$reading.$metric } }
    $rows += [pscustomobject]@{at=[DateTimeOffset]::UtcNow.ToString('o');processes=$readings;privateWorkingSetBytes=$totals.privateWorkingSetBytes;workingSetBytes=$totals.workingSetBytes;privateCommitBytes=$totals.privateCommitBytes}
    Start-Sleep -Seconds 1
  }
  $hostRows = @($rows | ForEach-Object { $_.processes | Where-Object role -eq 'host' })
  $webviewRows = @($rows | ForEach-Object { $values = $_.processes | Where-Object role -eq 'webview'; [pscustomobject]@{privateWorkingSetBytes=($values | Measure-Object privateWorkingSetBytes -Sum).Sum;workingSetBytes=($values | Measure-Object workingSetBytes -Sum).Sum;privateCommitBytes=($values | Measure-Object privateCommitBytes -Sum).Sum} })
  $phases += @{name='restored';settlingSeconds=30;samples=$rows;summary=(Get-Summary $rows);hostSummary=(Get-Summary $hostRows);webviewSummary=(Get-Summary $webviewRows);restoreLatencyMs=$restoreWatch.Elapsed.TotalMilliseconds}
  $os = Get-CimInstance Win32_OperatingSystem
  $processor = Get-CimInstance Win32_Processor | Select-Object -First 1
  $pkg = Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json
  $runtime = Get-ChildItem 'C:\Program Files (x86)\Microsoft\EdgeWebView\Application' -Directory -ErrorAction SilentlyContinue | Where-Object Name -Match '^\d+\.' | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $SourceCommit) { $SourceCommit = (git -C (Join-Path $PSScriptRoot '..') rev-parse HEAD) }
  $battery = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
  $powerStatus = if ($battery) { [string]$battery.BatteryStatus } else { 'No Win32_Battery result' }
  $report = @{version=$pkg.version;binaryVersion=(Get-Item -LiteralPath $Executable).VersionInfo.ProductVersion;binarySource=$BinarySource;sourceCommit=$SourceCommit;worktreeDirty=[bool](git -C (Join-Path $PSScriptRoot '..') status --porcelain);binarySha256=(Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLower();webViewLoaderSha256=(Get-FileHash -LiteralPath $loaderPath -Algorithm SHA256).Hash.ToLower();startedAt=$started.ToString('o');completedAt=[DateTimeOffset]::UtcNow.ToString('o');platform=@{os=$os.Caption;build=$os.BuildNumber;cpu=$processor.Name;ramBytes=[long]$os.TotalVisibleMemorySize*1KB;webview2=$runtime.Name;powerStatus=$powerStatus};method=@{samplesPerPhase=$SamplesPerPhase;intervalSeconds=1;activitySeconds=$ActivitySeconds;monitoringMode=$MonitoringMode;trayTransition='NetMask renderer close-to-tray action; invoked through a temporary loopback-only WebView2 debugging port; built-in tray memory policy active';restoreTransition='second-instance activation handoff';privateWorkingSet='QueryWorkingSet resident pages with the Shared bit unset, summed across the host and descendants';privateCommit='GetProcessMemoryInfo PrivateUsage; committed private bytes, including nonresident pages';workingSet='GetProcessMemoryInfo WorkingSetSize; shared pages may be counted more than once';settings='Isolated NetMask settings and WebView2 data, Paper theme, automatic OS mutations disabled; temporary loopback WebView2 debugging enabled only by the harness';workload='Actual local saved networks; no speed test, update download, DNS change, rename, reconnect, registry change, or credential access';units='bytes; displayed MiB = bytes / 1048576'};activity=$activity;isolatedDataDirectory=$taskDirectory;phases=$phases}
  $resolvedOutput = [System.IO.Path]::GetFullPath($Output)
  New-Item -ItemType Directory -Path (Split-Path $resolvedOutput) -Force | Out-Null
  [System.IO.File]::WriteAllText($resolvedOutput, ($report | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($false))
  Write-Output ('Saved raw benchmark to ' + $resolvedOutput)
} finally {
  $env:NETMASK_DATA_DIR = $previousDirectory
  $env:WEBVIEW2_USER_DATA_FOLDER = $previousWebViewDirectory
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousWebViewArguments
  if ($app -and -not $app.HasExited) {
    $app.Refresh()
    if ($app.MainWindowHandle -ne [IntPtr]::Zero) { [NetMaskMemoryProbe]::PostMessageW($app.MainWindowHandle, 0x10, [UIntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
    if (-not $app.WaitForExit(10000)) { $app.Kill() }
  }
  # Retain the isolated settings directory for reproducibility; never alter user data.
}
