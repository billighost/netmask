# NetMask release audit

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

## Initial verification

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

## Follow-up application audit, 2026-11-04

The follow-up started from `923ad7c9335e7e2b73ed683f2d24311be1d86b4e` with a clean worktree. It reviewed the production renderer, native engines and platform adapters, desktop host, release scripts and configuration, and product documentation. Dependency directories and generated build output are excluded from the source audit. Fieldnotes, Orbit logo 15, and the Showcase README remain the selected design.

| Area | Finding and correction |
| --- | --- |
| Connection state | SSID or access-point changes on the same service retained previous download results, latency and sign-in banners. Connection identity now includes the SSID, adapter and access point; changes and read failures clear telemetry and advance an epoch. A speed test cannot attach an old result after switching away and back. |
| Open diagnostics | Pending DNS/identity/adapter/detail requests could refill cleared state after a connection change. Open dialogs reload on the epoch and discard older requests. The initial portal probe now starts after the initial snapshot; manual rechecks reject results from an earlier connection. |
| Native measurements | Gateway caching, jitter history, transfer baselines and portal signatures could survive a connection change. Snapshot generations invalidate them; workers discard results spanning a generation or visibility change. A new connection receives a portal event even when its captive state is unchanged. Missing counters emit unavailable readings. |
| DNS | A manually selected resolver was timed under the Automatic row. Automatic now has an unmeasured state unless DHCP is active; custom current DNS appears separately. Apply verifies the configuration target returned by the comparison. |
| Windows identity | Historical Network List rows could consume the live WLAN profile's recovery identifier. Live rows map first, each profile is consumed once, and ambiguous candidates are avoided. MAC randomization requires a unique profile and targets its adapter explicitly. |
| macOS services | A service from another network location could receive live radio details or be selected for an operation by a duplicated label. Active mapping respects the current location, ambiguous services are rejected, and inactive/duplicated labels are non-editable. Reconnect polls for the reported SSID before returning success. |
| Masking recovery | A rejected activation could leave a session record that prevented retry. Confirmed unchanged names clear that record; uncertain or changed names retain recovery. Corrupt preferences disable automatic masking and silent elevation in the fallback state. |
| Updater | Late initial status could overwrite newer events; deleted/changed cached installers or failed launches could trap readiness/retry. Event revisions protect initialization, cache checks allow retry, stale readiness is cleared, and missing checksums offer the release-page fallback. |
| Keyboard | The name editor consumed modified Enter even when reassigned to another action; composition Enter could submit a name. Only plain, non-composing Enter submits the editor; modified keys reach the configured dispatcher. |
| Rendering and scrolling | Every unchanged refresh replaced the list's objects, and every selection notified every row. Snapshots preserve references, rows subscribe to selected booleans, rows/filtering are memoized, the list has bounded scrolling, and popover repositioning is coalesced through animation frames. Row-level content visibility was tried and removed after measurement showed extra scroll/layout cost. |
| Desktop test/build coverage | The former native script tested only the core and concealed obsolete host tests. It now runs the whole workspace, and IPC serialization contracts use the real result types. This exposed a Windows startup failure: GNU's injected manifest collided with application resources, and host unit tests lacked Common Controls v6. All Windows hosts now receive one application manifest; a compiler-spec override omits only GNU's injected default manifest. The installed compiler and OS are unchanged. |
| Product claims and release checks | README privacy wording now describes the active display name and selected fields. The release workflow checks the built interface before native package builds. A [product and launch plan](PRODUCT_STRATEGY.md) covers branding, prioritized future features, pricing experiments, distribution, launch copy and adoption measures. |

Follow-up verification:

- **37 JavaScript tests** passed after release hardening; TypeScript, the hooks lint, and the production renderer build passed. Added release fixtures distinguish capacity failures from code failures, enforce complete OS package sets, remove unavailable download links, preserve prior verified installers, and reject tampered retry downloads.
- **28 browser scenarios** passed with no JavaScript errors. Added coverage includes reassigned Enter/IME, connection-change telemetry cleanup, unavailable transfer readings, a late DNS comparison on an open dialog, and 1,000-network scrolling/search/keyboard selection.
- **32 native tests** passed across the whole workspace: 31 core tests and one desktop IPC contract test. Three subprocess fixtures remain intentionally ignored in direct enumeration and are invoked by the deadline test. Windows also exercises the Linux/macOS parser fixtures; it does not execute their operating-system integrations.
- Rust formatting and workspace checks passed. The desktop host test starts normally after the manifest correction; the previous `0xc0000139` failure and GNU resource collision were reproduced and resolved. MSVC tooling is unavailable locally, so the published Windows compiler path still needs CI verification.
- `npm run tauri:build -- --no-bundle` built the optimized Windows executable successfully. Read-only resource inspection confirmed Common Controls v6, long-path support, non-elevated startup, the branded icon and version metadata. This build does not constitute a fresh installer or real-device mutation test.
- Fresh v2.3.1 Windows NSIS and MSI installer compilation passed locally with the installed GNU toolchain (approximately 6.95 MiB and 10.66 MiB). They remain local verification artifacts; published Windows packages use the CI MSVC compiler.
- The final [renderer comparison](../BENCHMARKS.md) measured roughly **89% less script time** and **80% lower 95th-percentile frame intervals** in the specified synthetic 1,000-network workload. The committed [raw report](benchmarks/renderer-audit-2026-11-04.json) records the build asset hashes and individual runs. This is not a native RAM, battery, or universal frame-rate claim.

## Release recovery and v2.3.1 preparation

The former v2.3.0 release workflow (`41863350341`) passed source verification and Windows/Linux tests and installers. Both Mac jobs were cancelled with no executed steps because GitHub reported: “The job was not acquired by Runner of type hosted even after multiple attempts.” Publication skipped because those required jobs did not finish. The v2.2.0 release was already published with its five original native packages; it needed no repair.

The v2.3.0 failed jobs were rerun against the unchanged tag at `923ad7c9335e7e2b73ed683f2d24311be1d86b4e`. Both Mac runners subsequently acquired jobs. The recovered [v2.3.0 release](https://github.com/billighost/netmask/releases/tag/v2.3.0) now contains all six native packages and checksums.

At the user's explicit request, new release automation publishes successful platforms while an OS with a confirmed allocation failure remains unavailable. A cancelled job must have no runner, no executed steps, and the capacity annotation; actual test/build failures, unexplained cancellations, missing jobs and incomplete package sets remain blocking. The always-running CI Gate and merge helper enforce that distinction. Installer compilation now runs before merging as well as after tagging. Publication generates accurate availability notes and checksums; a separate workflow retries capacity failures up to three attempts, and manual dispatch can add one missing platform later without moving the tag.

PR [#14](https://github.com/billighost/netmask/pull/14) merged the v2.3.1 release work at `d00ce49abda2f783e192ad6cd7559176c33b9236`. Workflow run `41959214377` completed successfully, and the published [v2.3.1 release](https://github.com/billighost/netmask/releases/tag/v2.3.1) contains all six packages, checksums, and `availability.json`.

## v2.3.2 Windows and interface follow-up, 2026-11-05

- Device identity, DNS configuration, and adapter settings failed because Windows exposed `InterfaceGuid` as `System.String`, while scripts called `.ToString('B')` as though it were already a `Guid`. All affected reads now cast with `([Guid]$value).ToString('B')`.
- A read-only diagnostic run in a standard, non-elevated Windows session succeeded for the network snapshot, device identity, DNS settings/comparison, and adapter capabilities. It observed 479 saved networks without mutating Wi-Fi, DNS, registry, credentials, or drivers.
- Protected operations now elevate the branded NetMask executable through native `ShellExecuteExW`. A bounded base64 JSON request permits only validated NetMask rename, DNS, MAC-randomization, NetBIOS, driver, and elevation-task operations. Network-label changes use native NLM/WLAN APIs; PowerShell remains for Windows cmdlets that do not yet have a native implementation.
- Generic `powershell.exe failed (exit code Some(1))` messages were replaced with administrator, unavailable-command, invalid-parameter, cancellation, and unsupported-setting guidance. Admin accounts still normally run applications without elevation under UAC, so protected changes may legitimately request approval.
- Saved networks now occupy a responsive 76–360 px internal scroll region, including 1,000-row browser coverage. Saved-network and shortcut searches suppress the global red focus ring and use the Fieldnotes underline.
- The Windows memory benchmark isolates both settings and WebView2 data, includes the host and renderer descendants, and performs no explicit memory trim or live network mutation. The final clean-commit run measured median private resident memory of **135.8 MiB visible** and **119.6 MiB in the tray**; [the performance guide](../BENCHMARKS.md) records ranges, other metrics, limitations, the binary hash, and raw samples.
- Verification passed 37 JavaScript tests, TypeScript, hooks lint, the production renderer build, 28 browser scenarios, Rust formatting, the native workspace check, 35 executed native tests, actionlint, release-source/link review, and the production dependency audit. Three subprocess fixtures remain intentionally ignored in direct enumeration and are exercised by the deadline regression test.
- The final read-only Windows diagnostic ran without elevation and returned a connected snapshot with 479 saved networks plus successful identity, DNS settings/comparison, and adapter-capability results. Protected UAC operations were not exercised against live network state.
- Before this release, three installed NetMask entries (v2.3.1, v2.2.0, and a stale v1.0.0 record) were removed from the test machine. Verification found zero registered installs, processes, installed executables, shortcuts, Appx packages, or Winget packages. User settings and recovery data were preserved outside the install directory for the new release.

Mesh tools were unavailable during this follow-up. This document and the product/performance guides provide the durable handoff: source fixes and regression checks are complete; supported-platform manual install/permission/reconnect/DNS/recovery/update checks, release CI, and the proposed launch work remain separate validation and product tasks.

## v2.3.3 local-label confirmation and tool scope, 2026-11-05

- A read-only diagnostic of the installed v2.3.2 state found that Windows had persisted the local network label, the active network row and connection label agreed, and the label intentionally differed from the router SSID. The app now states this distinction beside the editor and in its success message.
- Rename and restore actions no longer trust a successful native return by itself. The renderer refreshes the network snapshot and requires the same stable network identity to contain the expected label; an active connection must also report the expected label before success is shown.
- The native rename path separately verifies the same stable identity and expected label, preserving the recovery record when the operating system does not confirm the result.
- Computer and adapter identity is no longer exposed as a selected-network action. It remains in Settings as **This device and adapter**, with explicit scope text and matching native error wording.
- Frontend and browser fixtures cover native false-success responses for both rename and restore, verify that the displayed value stays unchanged on failure, and confirm that device/adapter controls are absent from per-network actions.
- Verification passed 39 JavaScript tests, TypeScript, hooks lint, the production renderer build, 28 browser scenarios, Rust formatting, the native workspace check, 35 executed native tests, actionlint 1.7.12, 65 local documentation links, a tracked-source credential-signature scan, and the production npm dependency audit. Three subprocess fixtures remain intentionally ignored in direct enumeration and are exercised by the deadline regression test.
- A local optimized v2.3.3 Windows build produced a 7,316,500-byte NSIS installer and an 11,231,232-byte MSI with matching 2.3.3 executable metadata. These are local verification artifacts; publication rebuilds packages on the protected multi-platform CI matrix.
- The final read-only v2.3.3 diagnostic ran without elevation. It returned a connected 479-network snapshot, successful identity/DNS/adapter reads, and confirmed that the live row and connection use the same local label while that label differs from the router SSID.
- The diagnostic and automated tests do not rename a live network, reconnect Wi-Fi, approve an elevation prompt, or change protected network settings. Supported-platform CI and target-hardware checks remain the evidence for OS integration and installer behavior.

## Boundaries

The audit does not change the developer's live Wi-Fi, DNS, registry, credentials, or driver settings as a test. Parser, socket, storage, subprocess, and browser fixtures do not prove permission prompts, real reconnects, Wi-Fi hardware behavior, signing, or every desktop environment's displayed name.

Windows permission-controlled settings, macOS Location Services/Keychain access, and Linux NetworkManager/desktop integration need manual checks on the target device. Every published platform must pass native checks and installer builds. At the user's request, a confirmed runner-allocation failure leaves that platform unavailable while successful platforms publish; actual application failures remain blocking.

The existing migration release is [v2.2.0](https://github.com/billighost/netmask/releases/tag/v2.2.0), merged through PR #12 at `23eaf366e684e3d237761ec3f9dc3970d7fc763e`. The Fieldnotes/Orbit release follows the same pull-request, merged-commit tag, and verified-publication protocol.
