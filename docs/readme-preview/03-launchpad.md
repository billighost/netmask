<p><picture><source media="(prefers-color-scheme: dark)" srcset="../../src/renderer/public/branding/mark-light.svg"><img src="../../resources/netmask-icon.svg" width="44" alt="NetMask Orbit logo"></picture></p>

# NetMask

**Local network names. Clear connection details. Windows, macOS, and Linux.**

Rename saved networks on your computer, keep their original names, and use a private display name when sharing your screen.

## Download v2.3.0

| Your computer | Get the app | Install |
| --- | --- | --- |
| **Windows 10 / 11 · x64** | [Installer](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_x64-setup.exe) · [MSI](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_x64_en-US.msi) | Run the installer. |
| **Mac · Apple silicon · macOS 12+** | [DMG](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_aarch64.dmg) | Drag NetMask into Applications. |
| **Mac · Intel · macOS 12+** | [DMG](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_x64.dmg) | Drag NetMask into Applications. |
| **Linux · x64 · NetworkManager** | [DEB](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_amd64.deb) · [AppImage](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_amd64.AppImage) | Install the DEB, or make the AppImage executable. |

[Release notes](https://github.com/billighost/netmask/releases/tag/v2.3.0) · [Checksums](https://github.com/billighost/netmask/releases/download/v2.3.0/checksums.txt) · [Installation notes](../../SECURITY.md) · [All releases](https://github.com/billighost/netmask/releases)

## Inside the app

<picture><source media="(prefers-color-scheme: dark)" srcset="../assets/fieldnotes-dark.png"><img src="../assets/fieldnotes-paper.png" width="960" alt="NetMask showing the Studio connection, saved network profiles, local name editing, privacy controls, and network tools"></picture>

<sub>The actual Fieldnotes interface, using fictional networks and sample measurements.</sub>

## Three things to try

1. **Make a network recognisable.** Select a profile, write a local name, and choose **Save name**. **Restore original** brings the old one back.
2. **Keep names out of a screenshot.** Enable **Hide names while sharing**. You can also hide the access point address shown inside NetMask.
3. **Understand your connection.** Read the live activity and response times, open **Connection details**, or **Compare DNS**. Small **i** buttons explain the values.

You can also reconnect saved Wi-Fi, run a small download test, or share supported personal Wi-Fi with a QR image. QR codes contain readable credentials.

## What to expect

- **Local changes.** Your router's Wi-Fi name stays the same. Windows profile labels, Mac service labels, and Linux NetworkManager names are separate from that broadcast name.
- **Clear limits.** Available tools depend on your OS, adapter, and permissions. Missing readings stay unavailable. Display privacy does not make the connection anonymous.
- **A flexible window.** Paper and Dark themes, custom controls, and scrolling app panels and dialogs down to **320 × 200**.

## Development

Tauri 2 + Rust + React + TypeScript. Install Node.js 22.12+, Rust 1.90+, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run dev
```

[Contributing](../../CONTRIBUTING.md) · [Architecture](../ARCHITECTURE.md) · [Audit](../AUDIT.md) · [Release guide](../../RELEASE_GUIDE.md)

Created and maintained by **Bello Bilal** · [@billighost](https://github.com/billighost) · `bb2010ng@gmail.com` · [MIT](../../LICENSE)
