# Contributing to NetMask

Thank you for your interest in contributing to **NetMask**! We welcome bug fixes, documentation improvements, feature additions, and platform-specific enhancements.

---

## 🧭 Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Architecture Overview](#architecture-overview)
- [Branching & PR Workflow](#branching--pr-workflow)
- [Platform Specific Testing](#platform-specific-testing)
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

---

## Architecture Overview

NetMask is built on **Electron**, **React 18**, **TypeScript**, and **electron-vite**.

```
netmask/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── platform/         # Cross-platform network drivers
│   │   │   ├── types.ts      # NetworkPlatformProvider interface
│   │   │   ├── windows.ts    # Dual Registry & netsh wlan XML sync
│   │   │   ├── darwin.ts     # macOS networksetup & netstat
│   │   │   ├── linux.ts      # Linux nmcli & /proc/net/dev
│   │   │   └── index.ts      # Dynamic platform dispatcher
│   │   ├── admin.ts          # Cross-platform privilege elevation
│   │   ├── speed.ts          # Instant live speed sampling engine
│   │   ├── updater.ts        # GitHub Releases auto-update checker
│   │   └── index.ts          # Window management, tray & IPC handlers
│   ├── preload/              # Context isolation bridge
│   │   └── index.ts          # Safe window.nm API exposure
│   └── renderer/             # React UI application
│       ├── components/       # UI Components (TitleBar, UpdateBanner, etc.)
│       ├── icons/            # Realism SVG icons
│       ├── styles/           # Tokens and theme design system
│       └── store.ts          # Zustand state store
```

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

> [!IMPORTANT]
> The `main` branch is protected. Direct pushes to `main` are restricted. All changes require an approved Pull Request with passing CI tests.

---

## Platform Specific Testing

- **Windows:** Test profile renaming both in the Windows Settings Network List (`HKLM\...`) and the WLAN system service (`netsh wlan`).
- **macOS:** Test network listing and renaming with `networksetup` and speed sampling via `netstat -ib`.
- **Linux:** Ensure NetworkManager `nmcli` commands work and `/proc/net/dev` is read smoothly.

---

## Code Style & Verification

Before submitting your PR, ensure:
- [x] `npm run typecheck` passes with zero errors.
- [x] `npm run build` generates clean output bundles.
- [x] No stray or debug files remain in the project tree.
