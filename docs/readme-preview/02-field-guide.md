# NetMask

### A familiar name for your connection.

`HomeFiber_5G` can be **Studio**. An old wired profile can be **Workshop**. NetMask gives saved networks local names that make sense to you, keeps the originals, and puts connection details within reach.

<img src="../assets/fieldnotes-themes.png" width="960" alt="The actual NetMask app side by side in its warm Paper and green Dark themes, using fictional Studio and Workshop networks">

<sub>Fieldnotes: warm paper, green ink, and room to breathe. Sample networks and measurements.</sub>

## Give one a name

1. **Choose a saved network.** NetMask shows the profiles available on your computer.
2. **Write a name you recognise.** Select **Save name**; your system asks for permission when needed.
3. **Change your mind whenever you like.** Select **Restore original** to put the saved name back.

Your router keeps broadcasting the same Wi-Fi name. Windows may still show that name in its Wi-Fi menu; NetMask edits the local profile label.

## A few useful things beside it

**See what's happening.** Read transfer activity, response time, and available Wi-Fi details. The little **i** buttons explain technical terms in simple words.

**Share your screen comfortably.** Apply a private display name and hide the access point address inside NetMask. Display privacy changes what is shown; it does not make your connection anonymous.

**Stay close to your tools.** Reconnect saved Wi-Fi, compare DNS lookup times, test a small download, or create a QR code for supported personal Wi-Fi. A QR code includes readable credentials, so share it with someone you want to give access.

## Pick your download

**v2.3.0** · [What's new](https://github.com/billighost/netmask/releases/tag/v2.3.0)

- **Windows 10 / 11 · x64** — [Installer](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_x64-setup.exe) · [MSI](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_x64_en-US.msi). Run the installer.
- **Mac · Apple silicon · macOS 12+** — [Download DMG](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_aarch64.dmg). Drag NetMask into Applications.
- **Mac · Intel · macOS 12+** — [Download DMG](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_x64.dmg). Drag NetMask into Applications.
- **Linux · x64 · NetworkManager** — [Debian / Ubuntu](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_amd64.deb) · [AppImage](https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_amd64.AppImage). Install the DEB, or make the AppImage executable and open it.

[Verify your download](https://github.com/billighost/netmask/releases/download/v2.3.0/checksums.txt) · [Installation notes](../../SECURITY.md) · [Other releases](https://github.com/billighost/netmask/releases)

## Made for a small corner of your desktop

Paper and Dark themes. Custom menus and switches. Internally scrolling panels and dialogs, even at **320 × 200**. Settings keeps General, Privacy, Tools, and About easy to find.

Names and preferences stay in your account's data directory. Tools vary by OS and adapter, and unavailable controls explain why. Windows changes profile labels, macOS changes service labels, and Linux changes NetworkManager names.

<details>
<summary>Build NetMask or contribute</summary>

The app uses Tauri 2, Rust, React, and TypeScript. Install Node.js 22.12+, Rust 1.90+, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run dev
```

Read [Contributing](../../CONTRIBUTING.md), [Architecture](../ARCHITECTURE.md), [the audit](../AUDIT.md), or [the release guide](../../RELEASE_GUIDE.md).

</details>

Made by **Bello Bilal** · [@billighost](https://github.com/billighost) · `bb2010ng@gmail.com` · [MIT license](../../LICENSE)
