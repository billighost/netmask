<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="src/renderer/public/branding/mark-light.svg"><img src="resources/netmask-icon.svg" width="64" alt="NetMask Orbit mark"></picture></p>

<h1 align="center">NetMask</h1>
<p align="center"><strong>Know your connection. Control what you show.</strong></p>
<p align="center">A local-first desktop companion for connection history, observed data use,<br>call readiness, measured evidence, display privacy, and reversible network labels.</p>

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/fieldnotes-dark.png"><img src="docs/assets/fieldnotes-paper.png" width="960" alt="NetMask Fieldnotes interface showing the fictional Studio network, connection readings, saved networks, and local label editor"></picture></p>

<p align="center"><sub>Fieldnotes in Paper and Dark. Screenshots use fictional networks and sample measurements.</sub></p>

## What stays useful after setup

- **See what happened.** Review local, bounded history for drops, latency spikes, jitter, and network changes. Paused and unavailable periods stay visibly missing.
- **Understand observed data use.** Track what this computer counted per saved network across restarts, counter resets, adapter changes, and network switches. Set a personal limit with calm near-limit and over-limit warnings. These totals are not provider billing records.
- **Prepare for calls.** **Going live** checks the current connection and turns on sharing mode. Supported call or broadcast app detection can offer a prompt; automatic sharing is available only after an explicit user choice.
- **Use context without giving up control.** Preview per-network labels and display preferences before applying them, then undo safely.
- **Turn history into evidence.** The weekly digest says when coverage is too thin. Provider reports contain measured evidence, redact identifiers by default, show missing coverage, and never include Wi-Fi passwords.
- **Keep naming recoverable.** Local labels can be made familiar while original values remain available for restoration.

Everything stays on the device. Monitoring is off until enabled, can be paused, uses a 7, 30, or 90 day retention setting, and can be deleted completely. NetMask changes local labels and its own display; it does not rename the router, protect other apps, or make a connection anonymous.

## Get NetMask

**Latest: v2.7.0** · [Release notes](https://github.com/billighost/netmask/releases/tag/v2.7.0)

| Windows 10 / 11 | macOS 12+ | Linux |
| --- | --- | --- |
| **x64**<br>[Setup](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_x64-setup.exe) · [MSI](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_x64_en-US.msi) | [Apple silicon](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_aarch64.dmg)<br>[Intel](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_x64.dmg) | **x64 · NetworkManager**<br>[Debian / Ubuntu](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_amd64.deb) · [AppImage](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_amd64.AppImage) |

[Verify checksums](https://github.com/billighost/netmask/releases/download/v2.7.0/checksums.txt) · [Installation and privacy notes](SECURITY.md) · [All releases](https://github.com/billighost/netmask/releases)

## Small, honest, cross-platform

Paper and Dark themes, keyboard and screen-reader support, and one bounded scroll area keep every action reachable at **320 × 200**. Available readings and controls vary by operating system, adapter, and permissions; unsupported controls are disabled with an explanation.

Windows edits Network List labels, macOS edits network service labels, and Linux edits NetworkManager connection names. The app explains where an operating system cannot provide a reading or control.

## Build it

Built with **Tauri 2, Rust, React, and TypeScript**. Install Node.js 22.12+, Rust 1.90+, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), then:

```sh
npm ci
npm run dev
```

[Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Audit](docs/AUDIT.md) · [Release guide](RELEASE_GUIDE.md)

Created and maintained by **Bello Bilal** · [@billighost](https://github.com/billighost) · `bb2010ng@gmail.com` · [MIT](LICENSE)
