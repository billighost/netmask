# Performance measurement

The current app uses Tauri and a system webview. No complete, reproducible Tauri memory benchmark has been published in this repository yet. Installer size, Rust binary size, resident RAM, private working set, and committed memory are different measurements.

Previous numbers came from the former runtime and contained inconsistent memory labels and claims. They do not establish this app's memory footprint. Historical data remains available in Git history; current documentation does not reuse it as a Tauri result.

## What is implemented

- Transfer, ping, and portal polling pause while the window is hidden or minimized.
- Restoring visibility resets transfer baselines, avoiding spikes from accumulated traffic.
- Components subscribe to the specific state they render. Transfer history uses a fixed 60-sample typed array.
- Process detection continues for display-name automation in the tray, with scans spaced five seconds apart.
- Blocking native operations run away from the window thread and have bounded process/network timeouts.

The webview remains alive in the tray. Closing to the tray does not unload the renderer. Windows working-set trimming is an explicit action; it does not prove lower steady-state memory use.

## Measure a release

Use an installed release or a production native build, record the exact version and commit, and avoid the Vite development server. Record the OS, hardware, webview runtime, enabled preferences, network state, sampling interval, and duration.

Measure these states separately:

1. Visible and idle after startup settles.
2. Visible with normal transfer and ping telemetry.
3. Hidden in the tray for at least one minute.
4. Restored from the tray.
5. During an explicit speed test or update download.

Collect several samples and report a median and range. A single startup sample is not a steady-state result.

## Use the correct OS metric

| System | Recommended approach | Limitation |
| --- | --- | --- |
| Windows | Task Manager or Process Explorer; report private working set and commit separately for NetMask and its own WebView2 descendants | Summed working sets may count shared pages more than once; commit is not resident RAM |
| Linux | `/proc/<pid>/smaps_rollup`; report PSS/RSS and the app's actual webview descendants | Permissions and desktop webview processes vary; RSS includes shared pages |
| macOS | Activity Monitor or `vmmap`; state the exact reported metric and include relevant webview processes | macOS memory metrics are not directly interchangeable with Windows private working set |

Do not include unrelated browser processes merely because they use the same webview executable. Do not present package download size as memory use.

## Report a finding

Include the measured values, raw method, app state, sample duration, version, and reproducible steps. Explain any limitations rather than filling missing metrics with estimated values. Performance changes should be checked against the same baseline and workload.
