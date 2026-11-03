<div align="center">

# NetMask 2.0

**Local network display name customizer, real-time throughput detector, and streaming advisor for Windows.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6.svg)](https://microsoft.com/windows)
[![Electron](https://img.shields.io/badge/Electron-31.7.7-47848F.svg)](https://electronjs.org)
[![React](https://img.shields.io/badge/React-18.3.0-61DAFB.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5.4-3178C6.svg)](https://typescriptlang.org)

</div>

---

## 📌 Overview

**NetMask** allows you to customize the local display name of any saved Wi-Fi or Ethernet network on your Windows computer. Whether you want to conceal a sensitive network name during screen-sharing/streaming or organize connections with clean aliases, NetMask updates how Windows displays the network across the entire operating system &mdash; without modifying the router's hardware SSID or connection credentials.

In addition, NetMask includes a **real-time network speed monitor** with zero CPU overhead and an **intelligent streaming capability advisor** that translates raw bandwidth into plain-English streaming resolutions.

---

## ✨ Features

### 🔀 Dual-Layer Windows Network Synchronization
Windows stores connection names across two independent subsystems. NetMask synchronizes both simultaneously:
1. **Windows WLAN Service (`netsh wlan` / `WlanSvc` XML Profiles):** Updates what appears in the **Windows Taskbar Quick Settings Wi-Fi flyout** and System Tray.
2. **NetworkList Registry (`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles`):** Updates Windows Settings (*"Saved networks"*), Network & Sharing Center, and network adapter lists.
*The hardware SSID broadcast by your router and your Wi-Fi password remain untouched.*

### ⚡ Real-Time Network Speed Detector
- Ultra-lightweight asynchronous bandwidth measurement using native Windows network interfaces.
- Displays live download and upload throughput in **MB/s** and **KB/s**.
- Integrated 60-second live sparkline canvas visualization.
- One-click active bandwidth benchmark tester.

### 🎬 Streaming Capability Advisor
- Instant analysis behind your speed readings translating raw numbers into intuitive real-world advice:
  - **4K Ultra HD (2160p)** &mdash; Seamless high-bitrate streaming with multi-device capacity.
  - **1080p Full HD** &mdash; Crystal clear 60 FPS playback for YouTube, Netflix, and meetings.
  - **720p HD / 480p** &mdash; Standard playback and basic web tasks.
  - Multi-streamer household assessment.

### 🎨 Textured Realism Interface
- Tactile, modern dark and light themes crafted with custom design tokens.
- Hand-crafted SVG iconography with organic micro-interactions:
  - **Animated Wi-Fi Badges:** Full visibility by default, radiating outward wave broadcast ripples on hover.
  - **Active Network Badges:** Color-coded status indicators for active connections.
- **Top-Floating Glassmorphic Toasts:** Frosted acrylic capsule notifications with spring drop-in animations and status indicators.

### 🔄 Zero-Friction Reconnect & 100% Reversible
- **One-Click Reconnect:** Reset the Wi-Fi radio with a single click to force Windows to immediately refresh network names.
- **Safe Local Backups:** All original hardware SSIDs are automatically backed up to `%ProgramData%\NetMask\names.json`.
- **One-Click Restore:** Revert any network (or all networks) back to its original hardware name at any time.

### 🪟 Windows Native Experience
- Custom draggable title bar with smooth window snap, minimize, maximize, and restore controls.
- Window position and dimension persistence across restarts.
- System tray minimization and optional launch on Windows startup.

---

## 🚀 Quick Start (No Installation Needed)

You can run NetMask directly without installing:

1. Double-click [`Run-without-installing.bat`](Run-without-installing.bat).
2. Accept the Windows UAC elevation prompt (administrator permissions are required by Windows to write network display names to `HKLM`).
3. Select any saved network, enter a new name, and click **Apply name**.
4. Check your Windows Taskbar Wi-Fi flyout &mdash; your new name is live immediately!

---

## 🛠️ Building From Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- Windows 10 or 11 (64-bit)

### Installation

```bash
# Clone the repository
git clone https://github.com/billighost/netmask.git
cd netmask

# Install dependencies
npm install
```

### Development Mode

```bash
# Run with Vite hot-module replacement
npm run dev
```

### Production Build

```bash
# Typecheck TypeScript files
npm run typecheck

# Build main, preload, and renderer bundles
npm run build

# Package standalone distribution into dist/win-unpacked
npx electron-builder --dir
```

---

## 🔍 How It Works

```
┌─────────────────────────────────────────────────────────┐
│                       NetMask                           │
└──────────────┬───────────────────────────┬──────────────┘
               │                           │
               ▼                           ▼
 ┌───────────────────────────┐ ┌───────────────────────────┐
 │   Windows WLAN Service    │ │    NetworkList Registry   │
 │   (netsh wlan / XML)      │ │   (HKLM\...\Profiles)     │
 └─────────────┬─────────────┘ └─────────────┬─────────────┘
               │                             │
               ▼                             ▼
 ┌───────────────────────────┐ ┌───────────────────────────┐
 │   Taskbar Wi-Fi Flyout    │ │  Windows "Saved Networks" │
 │     & System Tray         │ │ & Network Sharing Center  │
 └───────────────────────────┘ └───────────────────────────┘
```

1. **Profile Export & XML Adaptation:** When renaming a Wi-Fi connection, NetMask exports the active profile XML, updates the top-level `<WLANProfile><name>` tag, and preserves the underlying `<SSIDConfig><SSID><name>` broadcast tag.
2. **Profile Re-Import & Interface Binding:** Re-adds the profile via `netsh wlan add profile`, shifts connection handles to the new profile, and removes the old alias to prevent duplicates in the taskbar list.
3. **Registry Synchronization:** Writes the updated `ProfileName` under the network's GUID in `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles`.
4. **Safety & Fallback:** Original profile names are indexed locally in `%ProgramData%\NetMask\names.json` before any mutation occurs.

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).

