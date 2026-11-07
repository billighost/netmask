<picture><source media="(prefers-color-scheme: dark)" srcset="../assets/fieldnotes-cover-dark.png"><img src="../assets/fieldnotes-cover-paper.png" width="960" alt="NetMask Fieldnotes cover with fictional Studio and Workshop networks"></picture>

# NetMask

**Know your connection. Control what you show.**

A local-first desktop companion that keeps measured connection history close, counts observed data use per saved network, prepares the app for calls, and turns history into honest weekly findings and provider evidence.

## Keep it useful

| Understand the connection | Prepare for context |
| --- | --- |
| Review drops, latency spikes, jitter, switches, and explicit gaps. Track observed upload and download totals with a personal limit. | Use Going live for a fresh check and sharing mode. Preview per-network labels and display preferences, apply them with permission, and undo safely. |
| **Find the pattern** | **Share measured evidence** |
| The weekly digest stays honest when coverage is thin and only suggests a DNS option when a local comparison supports it. | Export HTML or Markdown for a chosen period. Identifiers are redacted by default, missing coverage stays visible, and Wi-Fi passwords are never included. |

Monitoring is opt-in, local, bounded to 7, 30, or 90 days, pausable, and completely deletable. Alerts are opt-in and deliberately rare. Data-use totals are observed on this computer and are not billing-grade.

NetMask can also give a saved network a familiar local label while preserving its original recovery record. It does not change the router’s broadcast name, protect other apps, or provide anonymity.

## Take it with you

**v2.7.0** · [What changed](https://github.com/billighost/netmask/releases/tag/v2.7.0)

**Windows 10 / 11 · x64**<br>
[Setup](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_x64-setup.exe) · [MSI](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_x64_en-US.msi)

**macOS 12+**<br>
[Apple silicon](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_aarch64.dmg) · [Intel](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_x64.dmg)

**Linux · x64 · NetworkManager**<br>
[Debian / Ubuntu](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_amd64.deb) · [AppImage](https://github.com/billighost/netmask/releases/download/v2.7.0/NetMask_2.7.0_amd64.AppImage)

[Checksums](https://github.com/billighost/netmask/releases/download/v2.7.0/checksums.txt) · [Installation and privacy notes](../../SECURITY.md) · [All releases](https://github.com/billighost/netmask/releases)

<details>
<summary>Platform and interface details</summary>

Windows edits Network List labels, macOS edits network service labels, and Linux edits NetworkManager connection names. Readings and controls depend on the OS, adapter, driver, and permissions; unavailable features are disabled with a reason. Paper and Dark themes, keyboard support, and bounded scrolling keep the app usable at **320 × 200**.

</details>

<details>
<summary>Build it, understand it, or contribute</summary>

Tauri 2, Rust, React, and TypeScript. Install Node.js 22.12+, Rust 1.90+, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), then:

```sh
npm ci
npm run dev
```

[Contributing](../../CONTRIBUTING.md) · [Architecture](../ARCHITECTURE.md) · [Audit](../AUDIT.md) · [Release guide](../../RELEASE_GUIDE.md)

</details>

By **Bello Bilal** · [@billighost](https://github.com/billighost) · `bb2010ng@gmail.com` · [MIT license](../../LICENSE)
