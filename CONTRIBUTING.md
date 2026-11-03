# Contributing to NetMask

Thank you for your interest in contributing to **NetMask**! We welcome bug fixes, documentation improvements, feature additions, and platform-specific enhancements.

For a comprehensive engineering deep-dive, please consult [**`docs/ARCHITECTURE.md`**](docs/ARCHITECTURE.md) and [**`BENCHMARKS.md`**](BENCHMARKS.md).

---

## 🧭 Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Architecture & Directory Structure](#architecture--directory-structure)
- [Cross-Platform Platform Dispatchers](#cross-platform-platform-dispatchers)
- [ContextBridge IPC Schema](#contextbridge-ipc-schema)
- [Privilege & Elevation Guidelines](#privilege--elevation-guidelines)
- [Performance & Memory Guidelines](#performance--memory-guidelines)
- [Branching & PR Workflow](#branching--pr-workflow)
- [Platform-Specific Testing](#platform-specific-testing)
- [Code Style & Verification](#code-style--verification)

---

## Code of Conduct

This project and everyone participating in it is governed by the [NetMask Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/netmask.git
   cd netmask
   ```
3. Ensure you have **Node.js 20+** and **npm** installed.

---

## Development Setup

Install dependencies:
```bash
npm install
```

Start the application in development mode with hot reload:
```bash
npm run dev
```

Run TypeScript compilation check:
```bash
npm run typecheck
```

Build production bundles:
```bash
npm run build
```

Run empirical benchmark audit:
```bash
npm run benchmark
```

---

## Architecture & Directory Structure

NetMask is built with **Electron 31**, **React 18**, **TypeScript 5.5**, **Zustand 4.5**, and **electron-vite 2.3**.

```
netmask/
├── docs/
│   └── ARCHITECTURE.md             # Complete system architecture documentation
├── src/
│   ├── main/                       # Electron main process
│   │   ├── platform/               # Cross-platform network drivers
│   │   │   ├── types.ts            # NetworkPlatformProvider & RF telemetry types
│   │   │   ├── windows.ts          # Dual Registry & netsh wlan XML sync + RF
│   │   │   ├── darwin.ts           # macOS networksetup & Apple80211 airport + RF
│   │   │   ├── linux.ts            # Linux nmcli & /proc/net/dev + RF
│   │   │   └── index.ts            # Dynamic platform provider dispatcher
│   │   ├── admin.ts                # 3-Tier Cascading Silent Elevation architecture
│   │   ├── streamer.ts             # Low-overhead broadcast app detection & auto-cloak
│   │   ├── speed.ts                # Instant live speed sampling engine (bypasses cmd.exe)
│   │   ├── settings.ts             # Atomic settings persistence
│   │   ├── backup.ts               # Original SSID encrypted snapshots
│   │   ├── updater.ts              # GitHub Releases auto-update checker
│   │   └── index.ts                # V8 flags, window management, tray & IPC handlers
│   ├── preload/                    # Context isolation bridge
│   │   └── index.ts                # Safe, typed window.nm API bridge
│   └── renderer/                   # React 18 UI application
│       ├── components/             # Tactile UI components
│       │   ├── HeroCard/           # Live transfer, RF badges, BSSID cloaking
│       │   ├── NetworkDetailsModal/# In-depth RF Physical layer diagnostics
│       │   ├── NetworkList/        # Searchable network profiles
│       │   ├── ActionPanel/        # Rename editor & Windows Wi-Fi preview
│       │   ├── SettingsModal/      # Privilege, Streamer, and Memory settings
│       │   ├── ContextMenu/        # Right-click quick actions
│       │   ├── TitleBar/           # Mica/glassmorphic custom window controls
│       │   └── SpeedInfoPanel/     # Bandwidth capability tier advisor
│       ├── icons/                  # Animated SVG micro-interaction icons
│       ├── styles/                 # Tokens, glass surfaces, and themes
│       └── store.ts                # Zustand store with Float32Array ring buffer
```

---

## Cross-Platform Platform Dispatchers

All OS-specific network profile management and RF radio diagnostics implement the `NetworkPlatformProvider` contract (`src/main/platform/types.ts`):

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

When contributing platform-specific enhancements:
- **Windows (`windows.ts`)**: Keep both the Windows Network List Registry (`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles\<GUID>\ProfileName`) and the WLAN Service Profile XML (`netsh wlan`) synchronized so both legacy Control Panel and Windows 11 flyout reflect changes immediately.
- **macOS (`darwin.ts`)**: Use `/usr/sbin/networksetup` for profile naming and the private Apple80211 framework (`airport -I`) for RF metrics.
- **Linux (`linux.ts`)**: Interact cleanly with NetworkManager (`nmcli connection modify`) and parse raw byte counters directly from `/proc/net/dev`.

---

## ContextBridge IPC Schema

Renderer-to-Main communication must strictly adhere to the typed `window.nm` interface defined in `src/preload/index.ts`:

1. **Adding an IPC Handler**:
   - Register the handler in `src/main/index.ts` under `registerIpc()`.
   - Expose the method signature in `src/preload/index.ts` within the `api` object.
   - Update `src/renderer/src/env.d.ts` if adding new interface types.
2. **Push Notifications**:
   - Use `mainWindow?.webContents.send('nm:channel-name', payload)`.
   - Always return an unsubscribe cleanup function in the preload subscriber:
     ```typescript
     onSpeed: (cb: (sample: SpeedSample) => void): (() => void) => {
       const handler = (_: unknown, data: SpeedSample) => cb(data)
       ipcRenderer.on('nm:speed', handler)
       return () => ipcRenderer.removeListener('nm:speed', handler)
     }
     ```

---

## Privilege & Elevation Guidelines

NetMask implements a **3-Tier Cascading Elevation Architecture** (`src/main/admin.ts`):

- **Tier 1 (Task Scheduler)**: Default on Windows. Registers `NetMask_Elevated` with `/rl HIGHEST`. When launched via this task, the app runs with full privileges and zero UAC prompts.
- **Tier 2 (Elevated Broker)**: Executes operations via an existing elevated runner instance if available.
- **Tier 3 (On-Demand JIT)**: When running un-elevated, network rename operations invoke a just-in-time worker. This prompts UAC only for that specific rename and never crashes or forces an application restart. If the user rejects the prompt, catch the error gracefully with `"Rename canceled. Administrator privileges were not granted."`.

---

## Performance & Memory Guidelines

NetMask targets a physical footprint of **<35–45 MB active** and **~18–25 MB in the tray**. When writing code:

1. **Zero-Allocation High-Frequency Loops**: Avoid recreating arrays or objects in the 1,000ms speed tick. Use typed arrays (`Float32Array(60)`) and ring buffers.
2. **Selective State Subscriptions**: In React components, always use selective Zustand selectors (`useStore(s => s.speed.downMBps)`) rather than subscribing to the entire store object (`useStore()`).
3. **Visibility Awareness**: Pause animations, canvas rendering, and interval queries when `document.hidden` is true or the window is minimized.
4. **Child Process Execution**: Never spawn shell processes (`cmd.exe` or `sh`) when executing system binaries. Always use `execFile` directly to eliminate process churn and security risks.
5. **Tray Standby Unloading**: Keep the `BrowserWindow` destroyed while hidden in the tray so the Chromium Renderer process terminates and memory drops to the pure Node event loop.

---

## Branching & PR Workflow

1. Always branch off the latest `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/my-feature-name
   ```
2. Commit your changes with clear, descriptive commit messages.
3. Push your branch to your fork:
   ```bash
   git push origin feature/my-feature-name
   ```
4. Open a Pull Request against `billighost/netmask:main`.
5. Fill out the PR template thoroughly. All CI checks must pass before merging.

---

## Platform-Specific Testing

- **Windows:** Test profile renaming in both Windows Settings (`HKLM\...`) and the WLAN system service (`netsh wlan`). Verify Task Scheduler silent elevation and JIT elevation.
- **macOS:** Test network listing and renaming with `networksetup` and RF telemetry via `airport -I`.
- **Linux:** Ensure NetworkManager `nmcli` commands work and `/proc/net/dev` is read smoothly.

---

## Code Style & Verification

Before submitting your PR, ensure:
- [x] `npm run typecheck` passes with zero errors.
- [x] `npm run build` generates clean output bundles.
- [x] `npm run benchmark` passes and reports accurate WS-Private metrics.
- [x] No stray or debug files remain in the project tree.
