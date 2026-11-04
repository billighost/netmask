# NetMask architecture

The app has one runtime: Tauri 2 hosts a system webview and a Rust backend. React, TypeScript, Zustand, and Vite build the interface. Network, storage, background, and update operations are native Rust engines.

```mermaid
flowchart LR
  UI[React components] --> Actions[Frontend actions and state]
  Actions --> Bridge[Typed Tauri bridge]
  Bridge --> Commands[Async native commands]
  Commands --> Core[Native core engines]
  Core --> OS[Windows / macOS / Linux integrations]
  Core --> Data[Per-user JSON and recovery records]
  Workers[Visibility-aware workers] --> Core
  Workers --> Events[Tauri events]
  Events --> Actions
```

## Desktop host and native core

`src-tauri/src/lib.rs` owns the main window, branded tray, single-instance lock, worker stop flag, window-size persistence, and orderly shutdown. Its command handlers live in `commands.rs`. Slow handlers use `tauri::async_runtime::spawn_blocking` so subprocesses, downloads, locks, and diagnostics do not block the window thread.

The workspace's `netmask-core` crate points to `src-tauri/src/core.rs`. It contains the platform adapters, settings, rename/recovery operations, DNS, transfer measurements, ping, portal detection, QR sharing, identity controls, roaming, streamer automation, and updater. Separating it from the webview permits actual native-engine tests without launching a desktop or changing a real network.

## Network identity and changes

A network snapshot returns saved profiles, the connected network, and a separate connection error. Stable identities survive display-name changes: Windows Network List GUIDs, macOS network-service UUIDs, and Linux NetworkManager UUIDs. A saved profile's connection parameters remain distinct from its editable local label.

`operations.rs` serializes name changes with a file lock. It refreshes the network, rejects stale expected names, writes the original before changing the OS, and asks the platform adapter to confirm the resulting label. Restore-all retains failed entries and reports partial failure. Backup imports merge records rather than overwriting an existing original.

Windows uses the Network List Manager and WLAN APIs alongside permission-controlled configuration commands. Ambiguous profiles are marked non-editable. macOS changes a service label with `networksetup`; it does not remove and recreate the Wi-Fi network. Linux changes NetworkManager connection names with `nmcli` and uses UUIDs for reconnects.

Windows mapping gives the live row first choice of a WLAN profile and never reuses its recovery identity for a historical row. macOS resolves services within the current network location; an ambiguous active adapter, an inactive location, or a duplicated service label cannot silently select a mutation target.

These are local labels. The router's broadcast SSID and any operating-system UI that chooses to show it remain governed by the router and OS.

## Persistence

Preferences and recovery records stay in the current account's data directory:

| System | Directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\NetMask` |
| macOS | `~/Library/Application Support/NetMask` |
| Linux | `$XDG_CONFIG_HOME/netmask`, or `~/.config/netmask` |

An absolute `NETMASK_DATA_DIR` override is available for isolated diagnostics. Tests inject temporary storage explicitly. Launching a diagnostic app also requires preferences that turn off automation; changing its data directory alone does not disable network operations.

`settings.rs` bounds JSON size, validates preferences and imports, merges new defaults into old preferences, serializes mutations with OS file locks, and replaces complete files atomically. On Unix it sets private directory/file permissions. Parse failures preserve the original file and surface an error rather than treating corrupt recovery data as an empty backup.

Windows migration copies missing settings and name files from the previous ProgramData location. It does not delete the old files or overwrite existing per-user data. `names.json` stores original labels and `streamer.json` stores a recoverable masking session. These files are JSON, not encrypted storage.

## Fieldnotes interface and events

`bridge.ts` maps the typed `window.nm` contract to Tauri `invoke`. `types.ts` and `env.d.ts` describe arguments, snapshots, status, and events. Add a command by updating the Rust handler, handler registration, bridge, and types together.

Event subscribers return cleanup functions and handle cleanup arriving before the asynchronous listener has registered. Events include speed, ping, captive-portal state, streamer status, update progress, visibility, and maximization.

`network-actions.ts` coalesces overlapping refreshes and forces a fresh snapshot after a mutation. Network filtering and keyboard selection use the same helpers. `settings-queue.ts` serializes optimistic writes and rolls a failed write back to confirmed settings without overwriting a newer choice. `update-actions.ts` owns update actions and synchronizes native download status.

Unchanged snapshots preserve object references. Network rows are memoized and subscribe to their own selected state; filtering is memoized. Connection identity includes the SSID, adapter and access point, rather than the editable name alone. A change or failed snapshot clears connection measurements and advances a renderer epoch. Speed-test completions and open diagnostics reject earlier requests or reload on that epoch. Native snapshots maintain a generation that resets transfer baselines, gateway caches and jitter history; workers discard results spanning a generation change. Detection follows network reads, so it does not claim instantaneous operating-system network-change notifications.

Fieldnotes tokens define paper, green, and terracotta colors, serif display names, readable body type, and both themes. Shared `Controls` provide custom Select, Toggle, HelpTip, Tooltip, and Popover components. Popovers render outside scroll containers, stay within the viewport, and consume Escape before a parent dialog. Select keeps keyboard focus on its trigger, supports typeahead, and scrolls the active option into view.

The shared `Dialog` portals into the document body, makes the underlying app inert and hidden from assistive technology, traps focus, handles Escape, and restores focus when closed. Nested dialogs apply the same protection to the underlying dialog. The app and every dialog use a bounded scroll area so controls remain reachable at the 320 × 200 minimum window size.

## Background work and measurement

Transfer samples run once per second while the window is visible. Counter resets, missing samples, and interface changes reset the baseline. Windows reads adapter counters through native APIs; Linux reads `/proc/net/dev`; macOS reads interface counters from `netstat`. Measured transfer rate is distinct from negotiated link rate and the explicit download speed test.

Visible ping telemetry runs every two seconds. Captive-portal checks run about every 30 seconds while visible and emit state changes. Streamer status ticks once per second, with process scans every five seconds, including in the tray. Cooldown uses elapsed time. Manual masking persists independently of broadcast-process detection. Failed automatic operations do not open administrator prompts or claim protection succeeded.

Process scans are skipped when automatic masking is disabled. A rejected masking activation clears its session record only after confirming that the previous label remains intact; uncertain or changed state keeps recovery data. Damaged preferences disable automatic masking and silent elevation in the fallback state. Portal status is reprobed and emitted for a new connection even when its captive/non-captive state matches the previous connection.

Transfer rates aggregate physical adapters. Missing counters emit an unavailable sample so the renderer clears the last reading. DNS benchmarking measures the effective automatic resolver only when automatic configuration is active; manual/custom DNS is shown separately. Results carry the configuration target, and apply checks that it still matches before changing DNS.

The window hides to the tray rather than being destroyed. There is no claimed fixed Tauri RAM footprint or GPU-disable mode. See [BENCHMARKS.md](../BENCHMARKS.md) for measurement limits.

## External processes and updates

`system.rs` executes direct argument lists, hides Windows subprocess windows, enforces deadlines including inherited output pipes, stops process groups/job trees on timeout, and avoids echoing private subprocess output in errors. Permission-controlled operations propagate child failures.

The updater accepts the repository's stable GitHub releases, chooses the exact platform-specific native asset, limits redirect hosts and file size, verifies GitHub's SHA-256 digest, and retains native progress/status. Installation opens only the tracked verified path and rechecks its size and hash. Missing digests or unsupported architectures direct the user to the release page.

The production CSP restricts scripts, images, connections, objects, and framing. Capabilities apply to the main window. Website opening accepts HTTP/HTTPS addresses and passes them directly to the OS opener.

Updater initialization cannot overwrite newer progress/download events. A deleted or changed cached installer can be downloaded again; a failed installer launch clears renderer readiness so retry remains available.

## Branding, build, and release

[The selected Orbit SVG](branding/logos/orbit/mark.svg) is the branding source. `scripts/apply-branding.cjs` promotes its desktop exports and generates the renderer mark. `scripts/generate-installer-assets.py` creates the committed NSIS/MSI and DMG artwork. Builds do not require the image-generation tools.

`npm run test:ui` checks the built renderer and HTML studies in a browser with fictional IPC responses. It covers dropdown interaction, nested focus/scrolling, errors, names, sharing, and the minimum window size without operating-system mutations.

`npm run test:native` runs the entire Rust workspace, including IPC serialization contracts in the desktop host. `build.rs` embeds the same Common Controls v6, long-path, and non-elevated application manifest into Windows binaries and test hosts. On GNU targets it reads the compiler's endfile specs and omits only the injected default manifest; this avoids resource collisions without changing the installed toolchain. Published Windows builds continue to use MSVC.

`npm run build` produces `dist` from Vite. Tauri compiles the Rust host and installers; the release matrix builds Windows x64, Apple silicon, Intel macOS, and Linux x64. It stages only the expected native package names, requires all six before publishing, and creates a SHA-256 manifest. No second desktop framework is installed or shipped.

See [the audit](AUDIT.md) for fixes and verification boundaries and [the release guide](../RELEASE_GUIDE.md) for the required checks and publication sequence.
