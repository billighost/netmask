# Performance measurement

The current app uses Tauri and a system webview. No complete, reproducible Tauri memory benchmark has been published in this repository yet. Installer size, Rust binary size, resident RAM, private working set, and committed memory are different measurements.

Previous numbers came from the former runtime and contained inconsistent memory labels and claims. They do not establish this app's memory footprint. Historical data remains available in Git history; current documentation does not reuse it as a Tauri result.

## What is implemented

- Transfer, ping, and portal polling pause while the window is hidden or minimized.
- Restoring visibility resets transfer baselines, avoiding spikes from accumulated traffic.
- Components subscribe to the specific state they render. Transfer history uses a fixed 60-sample typed array.
- Unchanged snapshots retain network and connection objects; memoized rows and filtering avoid rebuilding the entire list for each refresh or selected row.
- The saved-network list has a bounded scroll area. Popovers coalesce repositioning through animation frames.
- Process detection runs for enabled display-name automation in the tray, with scans spaced five seconds apart. Disabling automation skips the process scan.
- Blocking native operations run away from the window thread and have bounded process/network timeouts.

The webview remains alive in the tray. Closing to the tray does not unload the renderer. Windows working-set trimming is an explicit action; it does not prove lower steady-state memory use.

## Renderer comparison, 2026-11-04

Compared a saved production build from before this follow-up audit with the final renderer changes on Windows 11 build 22000, an Intel Core i5-7200U, Node 24.12.0, and headless Edge 156.0.4314.58. Both builds used fictional native IPC, 1,000 saved networks, the same 300px list viewport, continuous scrolling, and transfer/ping events plus unchanged refreshes every 250 ms. Each build ran three alternating four-second samples.

| Metric, median of three runs | Before | After |
| --- | ---: | ---: |
| Script execution during sample | 1,947.1 ms | 207.8 ms |
| 95th-percentile animation-frame interval | 166.2 ms | 33.6 ms |
| Frames over 50 ms per sample | 16 | 1 |
| Layout execution during sample | 7.0 ms | 9.4 ms |

Script time decreased about **89%** and the 95th-percentile frame interval decreased about **80%** in this workload. Layout time increased about 2.4 ms per sample. The [raw report](docs/benchmarks/renderer-audit-2026-11-04.json) includes every sample and SHA-256 hashes of the compared JavaScript/CSS assets.

These are synthetic renderer measurements. Headless frame pacing and machine load affect timings; 33.6 ms is not evidence of a native 60 fps guarantee. This workload exaggerates large-list refresh costs and does not establish ordinary idle RAM, battery use, startup time, or hardware-network performance. A trial of row-level `content-visibility` increased scroll/layout work on this machine and was removed before the final comparison.

To repeat with a production baseline copied outside `dist`:

```sh
npm run build
npm run benchmark:ui -- path/to/baseline-dist
```

Running `npm run benchmark:ui` alone measures the current build. Reports are written to `.tmp/ui-checks/benchmark.json`. Keep the machine otherwise idle and retain the baseline build or rebuild its source revision for a fair comparison.

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
