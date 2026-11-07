# Security, privacy, and installation integrity

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/billighost/netmask/security/advisories/new) or contact maintainer **Bello Bilal** at `bb2010ng@gmail.com`. Include the affected version, reproduction steps, impact, and any proposed fix. Keep credentials, exported reports, database files, and personal network information out of public issues.

Security fixes target the current Tauri release. Historical packages are not evidence that an issue has been fixed; use the latest published release and its notes.

## Download and verify

Official packages are published at [billighost/netmask/releases](https://github.com/billighost/netmask/releases). The release workflow can publish verified package sets for Windows x64, both Mac architectures, and Linux x64, with `checksums.txt` and an availability manifest.

Compare a download's SHA-256 with the manifest from the same release:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\NetMask_2.7.0_x64-setup.exe
```

```sh
sha256sum NetMask_2.7.0_amd64.deb       # Linux
shasum -a 256 NetMask_2.7.0_aarch64.dmg # macOS
```

Checksums detect changed or incomplete files; they do not replace publisher code signing. This project does not currently claim verified Windows publisher signing or macOS notarization. SmartScreen or Gatekeeper may warn about an unrecognized download. Verify the source and file before making your own installation decision; do not disable system protections globally.

The in-app updater accepts stable releases from this repository, selects the exact native asset, restricts redirect hosts and download size, requires GitHub's SHA-256 asset digest, and rechecks the verified file before opening it.

## What stays on the device

NetMask has no telemetry or analytics service. Product settings, recovery data, monitoring records, and reports stay local unless the user explicitly opens, copies, or shares them.

Per-user data is stored in:

| System | Directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\com.billighost.netmask` |
| macOS | `~/Library/Application Support/NetMask` |
| Linux | `$XDG_CONFIG_HOME/netmask`, or `~/.config/netmask` |

An absolute `NETMASK_DATA_DIR` override exists for isolated diagnostics and tests.

The directory can contain:

- `settings.json`: themes, window bounds, monitoring choices, retention, alert and prompt choices, display-privacy settings, and validated custom broadcast-app basenames.
- `names.json` and `name-links.json`: original local labels and Windows identity links needed for safe restoration.
- `streamer.json`: a recoverable sharing-mode label change or timed session.
- `ui-state.json`: the last selected view, journal tab, history range, and selected saved network.
- `presets.json` and `preset-undo.json`: per-network local label/display preferences and the bounded state needed for a safe undo.
- `recovery-audit.json` and `update-pending.json`: recovery and post-update bookkeeping.
- `observation-key.json`: a random local key used to create device-local fingerprints of stable network, interface, and access-point identifiers.
- `observations.sqlite3` and its temporary SQLite sidecars: connection samples, explicit gaps, display labels, local fingerprints, observed usage totals and limits, counter discontinuity counts, user-run DNS evidence, calm-alert state, and the local alert inbox.

Stable identifiers in the observation database are keyed local fingerprints, but saved display labels are stored in readable form so the journal can name the affected network. Fingerprinting is not encryption or anonymity. The JSON files and SQLite database are not encrypted by NetMask. Unix builds set the data directory to mode `0700` and local files/database to private account permissions; the operating system and account security remain the protection boundary.

Connection history and observed usage default off and can be enabled independently. The shared pause control stops both without deleting retained records. Users can choose 7, 30, or 90 days of history retention and delete all monitoring data. Deletion removes the observation database, SQLite sidecars, and local observation fingerprint key. It deliberately does not remove settings, presets, saved labels, or recovery records. Retention runs locally and caps both time and row counts.

A paused or unavailable interval is stored as a gap or missing sample. NetMask does not interpolate readings. Observed data use is attributed only across continuous monotonic counters for the same boot, saved network, and interface. Restarts, resets, adapter changes, network switches, and long gaps establish a new baseline rather than guessed bytes. The result is not a provider bill and does not include traffic from other devices.

## Reports and sharing mode

Provider reports are built from measured local history for the chosen period. Missing coverage remains visible. Identifiers are redacted by default, and including a network label requires an explicit choice; that choice is disabled while sharing mode is active. The report schema has no Wi-Fi-password field, and connection history never reads or stores Wi-Fi passwords.

Sharing mode redacts supported names and identifiers inside NetMask and can temporarily change a supported local label. It does not hide information in other apps, change the router's broadcast SSID, hide the device from the router or provider, encrypt traffic, or provide anonymity. A standard Wi-Fi QR code contains readable credentials; NetMask reads supported saved credentials only after an explicit QR request and does not request them while sharing mode is active.

Per-network presets preview their changes before application. Original-name recovery records are written before label mutation, and uncertain or failed restores keep their records. Convenience presets must not replace or weaken this recovery path.

## Network requests

NetMask makes only the documented requests below. Monitoring modules, history storage, analysis, alerts, presets, and report generation do not contact a NetMask service.

| Trigger | Destination and purpose |
| --- | --- |
| Visible connection telemetry | ICMP to the local default gateway and `1.1.1.1` for router/internet response and jitter |
| Opted-in background history | The same gateway and `1.1.1.1` checks at the reduced tray interval needed to record history |
| Visible sign-in checks and Going live | HTTP to `http://www.msftconnecttest.com/connecttest.txt` to detect a captive portal |
| Explicit speed test | About 3 MB from `https://speed.cloudflare.com` |
| Explicit DNS comparison | UDP DNS queries to the active resolver and listed public resolvers |
| Update check/download | GitHub API/release pages and GitHub release-asset hosts |
| User-opened links | The exact HTTP or HTTPS address selected by the user, opened by the operating system |

These destinations receive the ordinary source IP address and request metadata associated with those network operations. ICMP or HTTP probes can be blocked by a firewall, VPN, provider, target, or operating-system policy; an unavailable result is not replaced with invented data.

Transfer counters and observed usage read local operating-system counters and do not inspect packet contents. Broadcast/call-app detection reads a local process snapshot at a bounded interval only when its prompt or automatic mode is enabled; it sends no process list off the machine.

When the window closes to the tray, NetMask keeps the webview intact but hidden so the same renderer state can return immediately. Visible transfer UI and captive-portal polling stop. Opted-in history, observed usage, context detection, and alerts continue through reduced native schedules. On Windows only, NetMask requests a bounded series of working-set trims for its hidden host and WebView2 processes; reopening cancels the remaining passes. Disabling background features removes their corresponding work.

## Operating-system limits

Name changes and DNS/driver settings may require operating-system permission. Canceled, unsupported, or failed operations report failure. Available Wi-Fi fields, BSSID access, counters, adapter controls, and local-label behavior vary by Windows version, Mac permissions, Linux desktop environment, NetworkManager, adapter, and driver.

A different access point behind a familiar name can be normal mesh or managed-network roaming. NetMask requires repeated observations and cooldowns before alerting and describes the measured change; it does not claim that a change proves an attack.

See [the architecture](docs/ARCHITECTURE.md), [audit](docs/AUDIT.md), and [performance method](BENCHMARKS.md) for implementation and verification boundaries.
