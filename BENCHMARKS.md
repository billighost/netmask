# Performance measurement

The current app uses Tauri and the operating system's webview. Previous numbers came from the retired Electron runtime and contained inconsistent memory labels and claims; they do not establish the current app's footprint. Installer size, Rust binary size, resident RAM, private working set, total working set, and committed memory are different measurements.

## v2.7.0 tray measurement, Windows, 2026-11-07

The current implementation keeps the main Tauri webview intact but hidden when the app closes to the tray. Visible-only transfer and captive-portal polling stop, while opted-in history, observed usage, context detection, and alerts continue on reduced native schedules. On Windows, the app requests bounded working-set trims for its host and WebView2 descendants while it remains hidden; reopening cancels any remaining scheduled passes.

The production comparison used Windows 11 Pro build 22000, an Intel Core i5-7200U, 7.9 GiB visible RAM, and WebView2 156.0.4314.58. Both executables used isolated settings and WebView2 data on the same machine. The harness enabled a temporary loopback-only WebView2 debugging port solely to invoke NetMask's real renderer **Close to tray** action; this is not enabled by the released app and no remote service was contacted. Each state reports ten one-second samples after a 30-second visible or 60-second tray settle.

The baseline was commit `50983ef240815880dd8847d5b4026fcdc33afeb1`, executable SHA-256 `e9e282e4bcd1bdc7382792759c5481e83a597aa17cddb0b0a392e14a1109950b`. The v2.7.0 Windows production installer build had executable SHA-256 `978bc91ca9777c7bdc98e9b06ddf44f853193e5df5a2d3ba60b0823f27ccea38`. The final build came from the reviewed v2.7.0 release-candidate worktree; the raw report records that the worktree was not yet committed, so the executable hash is the authoritative binary identity.

| Private resident memory, median (range) | Baseline | v2.7.0, monitoring off |
| --- | ---: | ---: |
| Visible after 30 s | 140.8 MiB (136.8-221.7) | 158.4 MiB (146.6-159.2) |
| Hidden in tray after 60 s | **122.6 MiB** (122.6-124.5) | **30.5 MiB** (30.2-30.8) |
| Restored after 30 s | 132.0 MiB (129.1-202.5) | 116.3 MiB (111.9-140.4) |

The settled tray median decreased by **92.1 MiB, or 75.1%**, on this machine. Total working-set median in the tray decreased from 385.3 MiB to 80.6 MiB. Private commit did not decrease: it changed from 167.7 MiB to 178.0 MiB, because working-set trimming makes resident pages reclaimable rather than decommitting the WebView2 address space. Do not describe the result as a 75.1% reduction in commit or cross-platform RAM.

Second-instance restoration took 185.9 ms for the baseline and 263.2 ms for v2.7.0. The v2.7.0 renderer remained intact and restored its saved in-memory session; the additional 77.3 ms is the measured tradeoff on this run.

With monitoring and observed usage enabled, the v2.7.0 tray median was 33.9 MiB (29.0-34.6). During the retained isolated run the local database contained 14 history samples, one usage checkpoint, and two per-network usage totals, confirming that opted-in native recording continued while the renderer was hidden. The raw reports are:

- [Corrected baseline](docs/benchmarks/native-memory-baseline-50983ef-renderer-close-2026-11-07.json)
- [v2.7.0, monitoring off](docs/benchmarks/native-memory-v2.7.0-monitoring-off-2026-11-07.json)
- [v2.7.0, monitoring on](docs/benchmarks/native-memory-v2.7.0-monitoring-on-2026-11-07.json)

The activity window was only 60 seconds: monitoring off used 1.0 process CPU second and 2,132,121 written bytes; monitoring on used 3.0 process CPU seconds and 1,356,307 written bytes. Run-to-run WebView2 maintenance dominates such a short write sample, so these values are attached as observations, not proof of a CPU, disk, or battery improvement. `Win32_Battery` reported status `2`. No battery-life claim is made. A ten-minute controlled activity and battery run remains future evidence work.

## Native memory, Windows, 2026-11-05

Measured the optimized v2.3.2 release-candidate executable from clean commit `e0d874a39481062ac97a5bfe921690f1272e1fb6` on Windows 11 Pro build 22000, an Intel Core i5-7200U with 7.9 GiB visible RAM, and WebView2 156.0.4314.58. The executable SHA-256 was `591a0ac1d26d4d1edb6ea6af5c4aab1349216def71a56572568fe9304ede014e`. NetMask settings and WebView2 data were isolated so another installed copy could not share renderer processes with the measured build.

| Metric, 15 one-second samples per state | Visible after 30 s | Hidden in tray after 60 s |
| --- | ---: | ---: |
| Private resident memory, median (range) | **135.8 MiB** (128.2–216.3) | **119.6 MiB** (118.8–120.7) |
| Total working set, median (range) | 388.2 MiB (380.8–518.1) | 374.7 MiB (373.0–375.2) |
| Private commit, median (range) | 189.0 MiB (181.4–302.7) | 172.8 MiB (171.0–173.0) |

Private resident memory is the sum of resident `QueryWorkingSet` pages whose Shared bit is unset across the NetMask host and its descendants. The visible median comprised 5.1 MiB in the Rust host, 130.4 MiB in WebView2, and the remainder in short-lived command descendants; the tray median comprised 5.1 MiB in the host and 114.6 MiB in WebView2. Total working set includes shared pages and can count them in more than one process. Private commit includes nonresident committed pages, so neither of those values should be relabelled as resident RAM.

The run used actual local saved networks and normal visible telemetry, Paper theme, automation disabled, no speed test or update download, and no explicit working-set trim. See the [raw report](docs/benchmarks/native-memory-v2.3.2-2026-11-05.json) for every sample and process. This is one machine, not a cross-platform guarantee.

To repeat the same safe measurement with an optimized Windows build:

```powershell
npm run tauri:build -- --no-bundle
npm run benchmark:memory
```

The harness creates isolated settings and WebView2 data, performs no network mutation, and writes `.tmp/native-memory.json`.

## What is implemented in the current source

- Closing to the tray persists the supported window state and hides the existing webview. Opening from the tray shows the same renderer and its in-memory state without a normal destroy/recreate cycle.
- Visible transfer and captive-portal polling stop without a visible window. Showing the window again starts transfer display from a fresh baseline, avoiding spikes from accumulated traffic.
- Monitoring defaults off. When history, observed usage, alerts, or broadcast context are enabled, native background work uses reduced tray intervals while the renderer is hidden.
- History records at 15-second opportunities and retains explicit paused/unavailable gaps. Usage counter discontinuities establish a new baseline instead of inventing bytes.
- Retention is applied hourly with bounded time and row caps; complete monitoring deletion removes the SQLite database and its sidecars.
- Components subscribe to the specific state they render. Transfer history uses a fixed 60-sample typed array.
- Unchanged snapshots retain network and connection objects; memoized rows and filtering avoid rebuilding the entire list for each refresh or selected row.
- The saved-network list has a bounded scroll area. Popovers coalesce repositioning through animation frames.
- Process detection runs for enabled display-name prompts or automation in the tray, with scans spaced five seconds apart. Disabling both skips the process scan.
- Blocking native operations run away from the window thread and have bounded process/network timeouts.

Windows close-to-tray schedules three bounded working-set trim passes for the host and its WebView2 descendants, and cancels pending passes when the window returns. The same trim remains available as an explicit diagnostic action. The measured v2.7.0 result and its limits are recorded above.

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
6. Hidden in the tray with monitoring disabled.
7. Hidden in the tray with history and observed usage enabled.
8. Restored from the tray with the prior UI session confirmed.

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
