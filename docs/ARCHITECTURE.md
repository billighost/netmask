# 🏛️ NetMask System Architecture Documentation

Welcome to the internal architectural documentation of **NetMask 2.0**. This document details the engineering specifications, cross-platform subsystems, security & privilege tiers, IPC schemas, and memory management lifecycle.

---

## 🧭 Table of Contents
1. [High-Level Architectural Overview](#1-high-level-architectural-overview)
2. [Component Hierarchy & Data Flow](#2-component-hierarchy--data-flow)
3. [ContextBridge IPC Schema & API Contract](#3-contextbridge-ipc-schema--api-contract)
4. [Cross-Platform Platform Dispatchers](#4-cross-platform-platform-dispatchers)
   - [Windows Subsystem (`windows.ts`)](#windows-subsystem-windowsts)
   - [macOS Subsystem (`darwin.ts`)](#macos-subsystem-darwints)
   - [Linux Subsystem (`linux.ts`)](#linux-subsystem-linuxts)
5. [3-Tier Cascading Privilege Architecture (`admin.ts`)](#5-3-tier-cascading-privilege-architecture-admints)
6. [Streamer Safe & Anti-Dox Engine (`streamer.ts`)](#6-streamer-safe--anti-dox-engine-streamerts)
7. [Throughput & RF Physical Layer Diagnostics (`speed.ts`)](#7-throughput--rf-physical-layer-diagnostics-speedts)
8. [Ultra-Low RAM Engine & Tray Standby Unloading](#8-ultra-low-ram-engine--tray-standby-unloading)

---

## 1. High-Level Architectural Overview

NetMask is structured as an isolated, multi-process Electron application enforcing strict process boundaries:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Renderer Process (UI)                          │
│   React 18 + Zustand + Granular Selectors + Canvas Sparkline Engine   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ window.nm (ContextBridge)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Preload Layer (Sandbox)                          │
│   Typed IPC Bridge (contextBridge.exposeInMainWorld / ipcRenderer)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC Channels (nm:*)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Electron Main Process Core                          │
│   • Window Manager & Tray Standby Lifecycle                            │
│   • 3-Tier Cascading Silent Elevation Broker                           │
│   • Streamer Safe Process Monitor (15s Interval + Cloaking)            │
│   • Zero-Spawn Bandwidth Sampling Engine (EMA Filtered)                │
│   • Dynamic Cross-Platform Dispatcher (Windows / Darwin / Linux)       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Hierarchy & Data Flow

### Reactive State Management (Zustand)
The UI renderer uses **Zustand** (`src/renderer/src/store.ts`) with granular slice selectors to prevent unnecessary re-renders:

- `networks`: Array of detected Wi-Fi and Ethernet network profiles.
- `connection`: Current active Wi-Fi connection metadata (SSID, dBm, SNR, band, Wi-Fi generation, link rates).
- `speed`: Live throughput samples (`downMBps`, `upMBps`, `downKbps`, `upKbps`).
- `history`: Fixed-size ring buffer (`Float32Array(60)`) powering the zero-GC canvas sparkline.
- `streamerStatus`: Active broadcast detection state (`detectedApp`, `isCloaked`, `cooldownSeconds`).
- `elevationStatus`: Current privilege tier (`isElevated`, `silentElevationEnabled`, `taskConfigured`, `tier`).
- `settings`: Persisted user configuration options.

### Component Tree
```
App.tsx
├── TitleBar (Glassmorphic Custom Controls + Minimize / Maximize / Close)
├── AdminBanner (Displays UAC Warning or 1-Click Silent Elevation Prompt)
├── StreamerBadge (Visual feedback when OBS/Discord/Teams is detected)
├── HeroCard (Active network card, live throughput, and RF metrics)
│   ├── Sparkline (Canvas-rendered 60s bandwidth graph)
│   └── BSSID Masker (Masked MAC display with 3-second temporary peek)
├── ActionPanel (Rename editor with real-time OS UI preview)
├── NetworkList (Searchable list of all network profiles)
│   └── NetworkRow (Individual Wi-Fi or Ethernet card with context menu)
├── SpeedInfoPanel (Expandable bandwidth capability advisor)
├── NetworkDetailsModal (In-depth RF physical layer radio diagnostic dialog)
├── SettingsModal (Full system preferences, privilege, streamer, and RAM controls)
└── ToastContainer (Non-intrusive status notifications)
```

---

## 3. ContextBridge IPC Schema & API Contract

All communication between the React renderer and Electron main process passes through `src/preload/index.ts`. No raw Node.js APIs are exposed to the DOM (`contextIsolation: true`, `nodeIntegration: false`).

### Typed IPC Invocation Table (`ipcRenderer.invoke`)

| IPC Channel | Method (`window.nm.*`) | Arguments | Return Type | Description |
| :--- | :--- | :--- | :--- | :--- |
| `nm:is-admin` | `isAdmin()` | `void` | `Promise<boolean>` | Checks if process has administrative rights |
| `nm:elevate` | `elevate()` | `void` | `Promise<void>` | Restarts process in elevated context |
| `nm:get-elevation-status` | `getElevationStatus()` | `void` | `Promise<ElevationStatus>` | Checks active tier & Task Scheduler registration |
| `nm:setup-silent-elevation` | `setupSilentElevation()` | `void` | `Promise<{ success: boolean; message?: string }>` | Registers `/rl HIGHEST` Task Scheduler entry |
| `nm:remove-silent-elevation`| `removeSilentElevation()`| `void` | `Promise<{ success: boolean; message?: string }>` | Deletes Task Scheduler entry |
| `nm:get-networks` | `getNetworks()` | `void` | `Promise<Network[]>` | Scans local network profiles |
| `nm:get-connection` | `getConnection()` | `void` | `Promise<Connection \| null>` | Returns active connection and RF telemetry |
| `nm:get-details` | `getDetails(guid)` | `guid: string` | `Promise<NetworkDetails>` | Returns in-depth physical layer RF stats |
| `nm:rename` | `rename(guid, newName, orig?)` | `guid, newName, orig?` | `Promise<void>` | Renames local network display profile |
| `nm:restore` | `restore(guid, current?)` | `guid, current?` | `Promise<void>` | Restores network to original hardware SSID |
| `nm:restore-all` | `restoreAll()` | `void` | `Promise<void>` | Restores all renamed profiles |
| `nm:reconnect` | `reconnect(profile?)` | `profile?: string` | `Promise<boolean>` | Flushes interface & reconnects |
| `nm:run-speed-test` | `runSpeedTest()` | `void` | `Promise<SpeedTestResult>` | Executes quick throughput test |
| `nm:export-backup` | `exportBackup()` | `void` | `Promise<string>` | Exports original SSID backup JSON |
| `nm:import-backup` | `importBackup(json)` | `json: string` | `Promise<void>` | Restores backup dictionary |
| `nm:get-settings` | `getSettings()` | `void` | `Promise<AppSettings>` | Reads settings from disk |
| `nm:set-setting` | `setSetting(key, val)` | `key: string, value: any` | `Promise<void>` | Updates setting atomically |
| `nm:trim-memory` | `trimMemory()` | `void` | `Promise<void>` | Trims process working set & invokes `gc()` |
| `nm:get-streamer-status` | `getStreamerStatus()` | `void` | `Promise<StreamerStatus>` | Returns active broadcast app state |
| `nm:toggle-streamer-cloak`| `toggleStreamerCloak()`| `void` | `Promise<StreamerStatus>` | Manually toggles streamer disguise |
| `nm:check-update` | `checkUpdate()` | `void` | `Promise<UpdateInfo \| null>`| Checks GitHub Releases API |
| `nm:open-release-url` | `openReleaseUrl(url?)` | `url?: string` | `Promise<void>` | Opens release in external browser |

### Push Event Subscriptions (`ipcRenderer.on`)

| Event Channel | Preload Subscriber | Payload | Purpose |
| :--- | :--- | :--- | :--- |
| `nm:speed` | `onSpeed(callback)` | `SpeedSample` | Broadcasts 1,000ms network throughput metrics |
| `nm:streamer-status`| `onStreamerStatus(cb)` | `StreamerStatus` | Broadcasts OBS/broadcast detection & cooldowns |
| `nm:maximize-change`| `onMaximizeChange(cb)` | `boolean` | Notifies title bar of window maximize state |
| `nm:update-available`| `onUpdateAvailable(cb)` | `UpdateInfo` | Pushes available software release notifications |
| `nm:trim-memory` | Main process internal | `void` | Renderer memory trimming trigger |

---

## 4. Cross-Platform Platform Dispatchers

All OS-specific logic is abstracted behind the unified interface `NetworkPlatformProvider` (`src/main/platform/types.ts`):

```typescript
export interface NetworkPlatformProvider {
  getNetworks(backup: Record<string, string>): Promise<Network[]> | Network[]
  getCurrentConnection(): Promise<Connection | null> | Connection | null
  getNetworkDetails(guidOrName: string): Promise<NetworkDetails> | NetworkDetails
  renameNetwork(guid: string, newName: string, currentDisplayName?: string): Promise<void>
  reconnectNetwork(profileName?: string): Promise<boolean>
  getRawNetworkBytes(): Promise<{ received: number; sent: number }>
}
```

The active provider is resolved at runtime by `getPlatformProvider()` (`src/main/platform/index.ts`) via `process.platform`.

### Windows Subsystem (`windows.ts`)
- **Dual Registry Sync**: Windows stores local network display names in `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles\<GUID>\ProfileName`. NetMask reads and modifies this value via PowerShell / Win32 registry APIs.
- **WlanSvc Profile XML Sync**: To update the native Windows 11 Wi-Fi flyout and Settings, NetMask syncs the WLAN service XML profile using `netsh wlan export profile` and `netsh wlan add profile`.
- **RF Radio Telemetry**: Parses `netsh wlan show interfaces` for logarithmic Signal (dBm), calculated SNR margin (+95 dBm floor), Radio Type (802.11be/ax/ac/n), Channel, and Band.
- **Throughput Engine**: Executes direct `netstat.exe -e` byte counter queries via `execFile`, bypassing `cmd.exe`.

### macOS Subsystem (`darwin.ts`)
- **Profile Management**: Uses `/usr/sbin/networksetup -listpreferredwirelessnetworks` and `-renamename`.
- **RF Telemetry**: Interfaces with the private Apple80211 framework via `/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I` to extract raw `agrCtlRSSI`, `agrCtlNoise`, `channel`, and `link auth`.
- **Bandwidth Sampling**: Measures interface byte differentials using `netstat -ib -n`.
- **Privilege Elevation**: Employs `osascript -e 'do shell script ... with administrator privileges'`.

### Linux Subsystem (`linux.ts`)
- **Profile Management**: Communicates directly with NetworkManager using `nmcli connection show` and `nmcli connection modify <id> connection.id <newName>`.
- **RF Diagnostics**: Queries wireless radio telemetry via `nmcli device wifi` combined with `iw dev <interface> link`.
- **Bandwidth Sampling**: Direct reading of Linux kernel socket device counters from `/proc/net/dev`.
- **Privilege Elevation**: Utilizes PolicyKit (`pkexec`).

---

## 5. 3-Tier Cascading Privilege Architecture (`admin.ts`)

Renaming system network profiles requires administrative privileges. Rather than forcing intrusive UAC prompts on every launch, NetMask uses a cascading 3-tier fallback architecture:

```
                  [Application Launch]
                           │
                 Is Task Configured?
                    ┌──────┴──────┐
                  YES             NO
                    │             │
        Tier 1: Silent Launch   Tier 2: Elevated Broker Active?
        (Task Scheduler /rl)      ┌──────┴──────┐
                    │           YES             NO
                 SUCCESS          │             │
                             Tier 2 Call   Tier 3: On-Demand JIT Elevation
                                          (Prompt UAC only when renaming)
```

1. **Tier 1 — Windows Task Scheduler (`setupTaskElevation`)**:
   - Registers a task named `NetMask_Elevated` via `schtasks /create /tn "NetMask_Elevated" /tr "\"<ExePath>\"" /sc onlogon /rl HIGHEST /f`.
   - On subsequent launches, an un-elevated NetMask instance invokes `schtasks /run /tn "NetMask_Elevated"` and cleanly exits.
   - **Result**: The app runs elevated with **zero UAC prompts forever**.
2. **Tier 2 — Elevated Broker**:
   - If an elevated background instance is already active, tasks are delegated seamlessly via local IPC.
3. **Tier 3 — On-Demand Just-In-Time (JIT) Elevation**:
   - If running un-elevated without Task Scheduler, NetMask remains non-elevated.
   - When the user explicitly renames a network, a targeted JIT elevation worker triggers a single UAC prompt for that specific rename only.
   - If the user cancels the prompt, NetMask catches the error gracefully without crashing.

---

## 6. Streamer Safe & Anti-Dox Engine (`streamer.ts`)

Broadcasters face unique risks when presenting screen contents:

### Automated Process Monitoring
- **Polling Loop**: Every 15 seconds, NetMask checks running processes via `tasklist.exe` (Windows) or `ps -e` (macOS/Linux) using `execFile` without launching a shell.
- **Target Applications**: OBS Studio (`obs64.exe`), Streamlabs, Discord, Zoom, Microsoft Teams, Twitch Studio, XSplit.
- **Auto-Cloak Action**: When a target process is detected, NetMask checks if the network is already cloaked. If not, it saves the original name and immediately renames the network to the user's Streamer Mask Name (`StreamSafe-Fiber-Pro`).
- **10-Second Cooldown**: When broadcast apps exit, NetMask initiates a 10-second cooldown timer. If no broadcast app reappears, it safely restores the original network name.

### Anti-Dox BSSID Cloaking
A router's hardware MAC address (BSSID) is indexed in public databases like WiGLE. Anyone viewing a streamer's BSSID can locate their physical address.
- **Masking Strategy**: Masks MAC addresses into partial vendor masks (`9A:B3:E0:••:••:••`) or full masks (`XX:XX:XX:XX:XX:XX`).
- **Protected Clipboard**: Copy actions copy the cloaked string by default unless the user has actively initiated a 3-second temporary peek.

---

## 7. Throughput & RF Physical Layer Diagnostics (`speed.ts`)

### Sub-Second Speed Polling
- **1,000ms Sampling**: Computes instantaneous byte differentials:
  $$\text{Speed (MB/s)} = \frac{\Delta \text{Bytes}}{\Delta t \times 1,048,576}$$
- **Exponential Moving Average (EMA)**: Applies a smoothing filter ($\alpha = 0.35$) to eliminate erratic packet bursts while preserving immediate response times.
- **Canvas Ring Buffer**: Pushes speed samples to a typed `Float32Array(60)` ring buffer in the Zustand store. The canvas sparkline draws directly from this buffer without instantiating any JavaScript arrays, eliminating V8 garbage collection churn.

### Radio Frequency Telemetry Formulas
- **Logarithmic Signal (dBm)**: Windows `netsh` reports signal as a 0–100% quality value. NetMask converts this to standard logarithmic dBm:
  $$\text{dBm} \approx \left(\frac{\text{Signal Percentage}}{2}\right) - 100$$
- **Signal-to-Noise Ratio (SNR)**:
  $$\text{SNR (dB)} \approx \text{Signal (dBm)} - (-95 \text{ dBm Noise Floor})$$
- **Wi-Fi Generation Mapping**:
  - `802.11be` &rarr; **Wi-Fi 7**
  - `802.11ax` (6 GHz band) &rarr; **Wi-Fi 6E**
  - `802.11ax` (2.4 / 5 GHz) &rarr; **Wi-Fi 6**
  - `802.11ac` &rarr; **Wi-Fi 5**
  - `802.11n` &rarr; **Wi-Fi 4**

---

## 8. Ultra-Low RAM Engine & Tray Standby Unloading

### The Problem of Chromium Footprint
A standard Electron desktop application runs four distinct OS processes:
1. **Browser Process** (Node.js runtime, window manager, IPC broker)
2. **GPU Process** (DirectX/ANGLE hardware compositing)
3. **Renderer Process** (Chromium Blink engine, DOM, React 18, V8 heap)
4. **Utility Process** (Network, audio services)

Each Chromium child process maps shared read-only system DLLs (`ntdll.dll`, `kernel32.dll`, `d3d11.dll`, `dxgi.dll`). Windows maintains only **one physical copy** of these pages in RAM, but summing raw working sets quadruple-counts them.

### True Tray Standby Unloading
To achieve an authentic **18–25 MB footprint in the system tray**:
1. When the user closes or minimizes the window to the tray (`s.minimizeToTray`):
   - The `BrowserWindow` instance is destroyed (`mainWindow.destroy()`).
   - The Chromium Renderer process (`Tab`) **terminates immediately**.
   - All DirectX GPU swapchains and textures are destroyed.
   - `stopSpeed()` pauses bandwidth polling; `stopStreamerMonitor()` keeps only minimal process checks.
   - Win32 `trimWorkingSet()` and `global.gc()` are executed.
2. The remaining footprint in the system tray consists exclusively of the lightweight Node/Electron main event loop (~18–25 MB Private Working Set).
3. When the user clicks the tray icon, `createWindow()` reinstantiates the window in **~150ms** with zero perceptible delay.

### Ultra-Low Memory Mode
When enabled in Settings, NetMask calls `app.disableHardwareAcceleration()` before `app.whenReady()`. This completely bypasses DirectX/ANGLE hardware acceleration, reducing active memory by an additional 50+ MB.

