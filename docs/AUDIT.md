# NetMask v2.3.0 audit

Audit date: **2026-11-04**. Scope: the Tauri host, native commands, operating-system integrations, persistence, workers, React behavior, accessibility, branding, installers, release tooling, and documentation.

The user selected **Fieldnotes** and **Orbit, logo 15**. The implementation uses warm paper and green ink, custom controls, simple descriptions, and information popovers. Original labels remain recoverable, unsupported operations report their limits, and content remains usable at the 320 × 200 minimum size.

## Corrections

| Area | Finding | Implemented correction |
| --- | --- | --- |
| Runtime | Retired Electron workflows and source remained beside Tauri. | Removed the old host, preload, dependencies, packaging, scripts, benchmark output, and build configuration. Development, checks, and installers use Tauri. |
| Platform identity | Empty results or invented success obscured platform limits. | Added Windows Network List/WLAN, macOS service, and Linux NetworkManager integrations with stable IDs and explicit capabilities. |
| Native commands | Slow subprocess and network work ran on the window thread. | Command handlers dispatch blocking work through the native async runtime. |
| Rename and recovery | Invalid, stale, or failed changes could claim success; restore-all dropped failed records. | Validate identifiers and names, check expected names, save originals before mutation, verify OS results, and retain unsuccessful recovery records. |
| Storage | Writes and malformed settings could fail silently or lose concurrent updates. | Per-user storage, bounded and validated JSON, atomic replacement, OS file locks, safe migration, and visible errors. |
| Display privacy | Wrong profile identity, incorrect countdowns, and failed changes could appear active. | Stable network mapping, recoverable masking sessions, elapsed-time cooldown, independent manual mode, and honest error state. |
| Transfer and latency | Reset counters could create spikes; failed samples could produce invented rates. | Platform-specific counters, baseline resets, real sample validation, and unavailable values where necessary. |
| DNS | Hardcoded adapter and TCP connection time were presented as DNS behavior. | Resolve the active connection, measure validated UDP DNS answers, verify mutations, and propagate failures. |
| Connection details | A saved profile could show another network's live radio values. | Scope details to the requested identity; preserve missing signal, security, and hardware data. |
| Wi-Fi sharing | Missing protected credentials could be treated as an open network. | Reject incomplete protected profiles, handle escaped Unicode and security types correctly, and explain that QR credentials are readable. |
| Updates | Arbitrary URLs and installer paths were trusted; progress and status diverged. | Exact repository assets, restricted HTTPS redirects, size and SHA-256 verification, a tracked install path, and synchronized progress/error state. |
| Processes | Timeouts could leave descendants or inherited output pipes running. | Process-group/job-tree deadlines, bounded output handling, and errors that avoid private subprocess output. |
| Background work | Visible diagnostics kept running in the tray; portal changes were not emitted. | Visibility-aware speed, ping, and portal polling, state-change events, and worker shutdown. |
| React state | Broad subscriptions and divergent refresh paths caused extra work and inconsistent selections. | Narrow subscriptions, one coalesced snapshot operation, mutation-aware refreshes, and shared filtering/selection helpers. |
| Preferences and actions | Failed settings and reconnects could leave optimistic or loading state behind. | Serialized writes with rollback, surfaced errors, coalesced actions, and loading cleanup. |
| Accessibility | Focus could escape dialogs or remain in a network menu. | Shared portal dialogs, inert and `aria-hidden` background, focus trapping/restoration, keyboard menus, and menu dismissal before opening a dialog. Underlying dialogs are hidden from assistive technology; notifications remain outside the inert background. |
| Keyboard | Default Ctrl bindings did not support Command on macOS. | Platform-aware matching, displayed Cmd labels, conflict detection, and preservation of unassigned shortcuts. |
| Interface | Mixed controls, dense terminology, unstyled About content, and short-window overflow. | Fieldnotes components, custom dropdowns/switches/tooltips, plain language, information popovers, styled maintainer card, and one scroll area per panel. |
| Branding | Default or inconsistent desktop and installer icons remained. | Orbit exports for SVG, PNG, ICO, ICNS, tray, shortcut, and native bundles; generated renderer mark and installer artwork. |
| Release | Platform package names and compatibility files could diverge. | Four native runners, six exact packages, checksums, tag/version/ancestry guards, and reviewed compatibility-asset cleanup. |
| Documentation | Old runtime RAM and UI/elevation claims were presented as Tauri behavior. | Rewritten installation, architecture, contribution, security, performance, release, design, and branding guides. No unmeasured Tauri memory claim. |

## Verification

- Frontend hook scan, TypeScript, production build, and **28 behavioral/verification tests** passed.
- Browser checks passed **23 scenarios** with no JavaScript errors: Paper and Dark at 320 × 200, 440 × 700, 900 × 360, and 1200 × 760; all four HTML studies; nested dialogs; custom dropdown keyboard handling and Escape; help positioning; long names; QR downloads; rename/restore/masking; rejected operations; preference rollback; menus; filtered selection; and platform capability handling.
- Native workspace check and **27 core tests** passed on Windows with the installed GNU compiler/runtime. Three helper test functions are intentionally ignored in the normal enumeration and are invoked as subprocess fixtures by the deadline test.
- Rust formatting passed. Native fixtures exercised storage locks, atomic replacement, recovery, platform parsing, DNS sockets, transfer counters, QR handling, privacy cooldown, subprocess deadlines, and update-source validation.
- Local Windows NSIS and MSI installer builds passed: approximately 6.95 MiB and 10.65 MiB. The GNU resource linker emitted a multiple-manifest merge warning; publication uses the Windows MSVC CI runner and requires its successful build. Local packages are verification artifacts and are not uploaded for release.
- An updater fixture initially assumed that version 2.3.0 was always newer than the app. It now derives a future version from the package version and checks that the current release is not offered as an update.
- The initial local native check lacked `windres` in PATH. The existing WinLibs toolchain resolved compilation and the earlier native-test runtime issue. This is recorded as an environment correction, not a code check that passed before the toolchain was available.
- Logo exports were checked for transparency and file integrity. The selected master generates all shipped variants; installer artwork leaves WiX's native page-title area clear.
- Personal and Public Desktop shortcuts were backed up and repaired to the installed native NetMask executable. Both targets exist, and both shortcut icons match the selected Orbit ICO by SHA-256. The repair helper uses a content-specific icon filename to avoid a stale shell icon.
- The user selected **Showcase, README option 1**, from four complete previews. The main README is approximately 370 words with real app screenshots, clear native downloads, and longer details linked to project guides. The offline preview gallery passed 35 browser scenarios, including all four layouts, both themes, narrow sizes, comparison scrolling, keyboard interaction, and exact Markdown downloads; all repository links and image paths were verified.
- Release-source review checked 70 local documentation links, excluded installers/build output and temporary files, and found no authentication material. The largest source asset is the approximately 451 KiB Windows installer artwork. The production npm dependency audit reported zero known vulnerabilities.
- GitHub's published v2.2.0 assets contain five native packages and no compatibility installers. Its 87 MB AppImage is a native package and is retained.

Browser evidence is generated by [scripts/verify-ui.cjs](../scripts/verify-ui.cjs) under `.tmp/ui-checks/`. CI repeats the browser checks and uploads the screenshots. Native and release checks are defined in [the release guide](../RELEASE_GUIDE.md).

## Boundaries

The audit does not change the developer's live Wi-Fi, DNS, registry, credentials, or driver settings as a test. Parser, socket, storage, subprocess, and browser fixtures do not prove permission prompts, real reconnects, Wi-Fi hardware behavior, signing, or every desktop environment's displayed name.

Windows permission-controlled settings, macOS Location Services/Keychain access, and Linux NetworkManager/desktop integration need manual checks on the target device. All four native CI checks and installer builds must pass for the published tag.

The existing migration release is [v2.2.0](https://github.com/billighost/netmask/releases/tag/v2.2.0), merged through PR #12 at `23eaf366e684e3d237761ec3f9dc3970d7fc763e`. The Fieldnotes/Orbit release follows the same pull-request, merged-commit tag, and verified-publication protocol.
