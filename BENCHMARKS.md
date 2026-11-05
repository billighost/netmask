# Performance measurement

The current app uses Tauri and the operating system's webview. Previous numbers came from the retired Electron runtime and contained inconsistent memory labels and claims; they do not establish the current app's footprint. Installer size, Rust binary size, resident RAM, private working set, total working set, and committed memory are different measurements.

## Native memory, Windows, 2026-11-05

Measured the optimized v2.3.2 pre-release executable on Windows 11 Pro build 22000, an Intel Core i5-7200U with 7.9 GiB visible RAM, and WebView2 156.0.4314.58. The executable SHA-256 was `9a255cb718e6d4df3a30c5edfb6bdad79fac24700c7fa8e2d302c8b518ee7d29`. NetMask settings and WebView2 data were isolated so an already-running installed copy could not share renderer processes with the measured build.

| Metric, 15 one-second samples per state | Visible after 30 s | Hidden in tray after 60 s |
| --- | ---: | ---: |
| Private resident memory, median (range) | **135.1 MiB** (127.6–199.1) | **119.1 MiB** (118.5–120.3) |
| Total working set, median (range) | 384.4 MiB (377.2–503.2) | 371.2 MiB (369.7–371.6) |
| Private commit, median (range) | 181.7 MiB (173.5–278.6) | 163.9 MiB (163.4–165.3) |

Private resident memory is the sum of resident `QueryWorkingSet` pages whose Shared bit is unset across the NetMask host and its descendants. The visible median comprised 5.1 MiB in the Rust host, 126.8 MiB in WebView2, and the remainder in short-lived command descendants; the tray median comprised 5.1 MiB in the host and 114.0 MiB in WebView2. Total working set includes shared pages and can count them in more than one process. Private commit includes nonresident committed pages, so neither of those values should be relabelled as resident RAM.

The run used actual local saved networks and normal visible telemetry, Paper theme, automation disabled, no speed test or update download, and no explicit working-set trim. The source tree was still a dirty v2.3.2 release candidate based on `d00ce49abda2f783e192ad6cd7559176c33b9236`; the exact binary hash above identifies what was measured. See the [raw report](docs/benchmarks/native-memory-v2.3.2-2026-11-05.json) for every sample and process. This is one machine, not a cross-platform guarantee.

To repeat the same safe measurement with an optimized Windows build:

```powershell
npm run tauri:build -- --no-bundle
npm run benchmark:memory
```

The harness creates isolated settings and WebView2 data, performs no network mutation, and writes `.tmp/native-memory.json`.

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
