# NetMask implementation audit

Audit date: 2026-11-07. Scope: the current v2.7.0 working tree for the desktop companion expansion. This document records source evidence and verification boundaries; it is not a security certification or a claim that every operating-system path has been exercised on real hardware.

## Product contract

NetMask is a local-first desktop connection companion. It can observe connection behavior on this computer, count observed traffic per saved network, prepare its own display for calls, apply reversible local-label/display presets, summarize measured history, export provider evidence, and alert on confirmed changes. It is not a router-management service, provider billing meter, packet sniffer, anonymity tool, VPN, or protection layer for other applications.

The implementation is expected to preserve these rules:

- monitoring and context behavior are opt-in;
- missing data remains missing;
- local data is bounded, pausable, and deletable;
- network and access-point identifiers are redacted from exported evidence by default;
- Wi-Fi passwords never enter history or evidence reports;
- original local labels remain recoverable;
- unsupported OS controls are unavailable with a reason;
- performance numbers require production measurements and raw evidence.

## Source review

### Tray lifecycle and background work

The close-to-tray path persists window bounds, hides the existing main window, emits hidden visibility, and keeps the renderer intact. Reopening shows and focuses the same renderer, preserving its in-memory state and delivering any pending tray intent. On Windows, three bounded working-set trim passes target the hidden host and descendant WebView2 processes; each pass stops if the window has returned.

Visible transfer and captive-portal workers require a visible window. Opted-in history, observed usage, alerts, and context detection use reduced native schedules in the tray. Disabling monitoring, usage, and app detection removes their corresponding probe or process-scan work. The Windows trimming policy and source shape alone are not measurements; the current before/after memory, CPU, disk, and battery evidence belongs in [BENCHMARKS.md](../BENCHMARKS.md).

### Local storage and migration

Existing JSON settings and recovery records remain in the per-user data directory. New settings default history, usage, prompts, and alerts off. History and usage can be enabled independently; the shared pause control stops both. New preferences merge into older files without discarding existing values. Local UI state and presets use separate validated JSON files.

Connection observations use a versioned SQLite WAL database. The schema stores measured/partial/disconnected/missing samples, explicit gaps, per-network observed usage and limits, DNS evidence from user-run comparisons, alert state, and a local inbox. Unknown newer schemas are preserved and rejected. Retention applies age and row caps; deletion removes the database and SQLite sidecars while leaving settings, presets, names, and recovery records intact.

Stable identifiers are local keyed fingerprints. Readable display labels remain in the local database for the journal, so the database is private local data rather than anonymized data. JSON and SQLite are not encrypted by the app.

### History and weekly findings

History supports 24 hours, 7 days, and 30 days, optionally filtered to one saved network. Buckets expose sample count, expected opportunities, latency/jitter summaries, drops, and a missing reason. Paused gaps survive restart. Charts have an accessible description and table alternative.

The weekly digest requires at least 100 measured samples, 25% expected coverage, two days, and six hours of measured span. It reports insufficient evidence below those gates. DNS suggestions require retained evidence from a user-run comparison and both a 10 ms and 20% measured improvement. The code does not synthesize readings for unobserved periods.

### Observed data use

Usage advances only for monotonic counters with the same boot, network, interface, and bounded interval. Restarts, resets, adapter changes, switches, and long gaps start a new baseline. Reset and adapter-change counts remain visible in the local record. Limits are user-defined and warning state resets per cycle. The UI and public copy describe totals as observed on this computer, not as provider billing or a hard cap.

Counter availability and semantics still depend on the OS, interface, driver, virtual adapters, sleep behavior, and permissions. The implementation avoids guessed bytes but cannot prove provider-side accounting.

### Context prompts, presets, and Going live

Supported call/broadcast detection can be off, prompt, or automatic sharing mode. Prompt mode offers accept, not now, and stop asking; it does not silently enable sharing mode. Custom process entries are validated executable basenames and process lists remain local.

Network presets contain an optional local label, ask/automatic mode, theme choice, and access-point display preference. Preview reports visible changes and permission needs. Label application uses the existing serialized recovery operation. One bounded undo record is persisted and remains available after tray hiding or a full application restart.

Going live performs fresh gateway, internet, jitter, captive-portal, and sharing-mode checks. Each result is ready, caution, not-ready, or unavailable. It reports one fresh measurement rather than guaranteeing a whole call.

### Alerts

Access-point changes require three consecutive confirmations and a 24-hour cooldown. Behavior changes require a robust baseline of at least 100 samples, three high samples, three recovery samples, and a six-hour cooldown. Alert categories are independently opt-in. The copy treats a changed access point as a change that can be normal on mesh or managed Wi-Fi, not proof of an attack.

### Provider evidence

Evidence is generated from retained samples and explicit gaps for the selected history period and network. Event thresholds come from that selected network's retained samples, and event details use the identifier-safe `redactedDetail` field. HTML and Markdown use the same returned dataset and are previewed before saving. Identifiers are redacted by default and cannot be included during sharing mode. Missing coverage and alternative causes are stated. The schema has no Wi-Fi-password field.

The report can demonstrate measurements made by this computer. It cannot prove that the provider caused every incident; local Wi-Fi, routing, firewall behavior, the probe target, or missing coverage can also matter.

### Cross-platform and accessibility boundaries

Windows, macOS, and Linux use different stable profile identities, label mechanisms, counters, and permission flows. macOS can withhold BSSID/signal without Location permission. Linux requires NetworkManager for managed profile actions. Adapter/driver controls are platform-specific. The renderer presents unavailable states rather than cross-platform fallback values.

The Fieldnotes interface retains Paper and Dark themes, focus trapping/restoration, keyboard controls, screen-reader labels, and bounded scrolling at the 320 × 200 minimum. Provider HTML report scrolling is covered by the browser fixture because nested iframe geometry is a regression risk.

## Network and privacy review

No new NetMask service or telemetry endpoint is introduced. Background history can send ICMP to the gateway and `1.1.1.1` when enabled. Captive-portal checks use Microsoft's documented test URL while visible or during Going live. Explicit DNS, speed, update, and opened-link requests remain documented in [SECURITY.md](../SECURITY.md). Observation storage, analysis, alerts, and report rendering themselves make no outbound request.

## Verification record for this working tree

Completed during the documentation pass:

- `npm run site:typecheck`: passed.
- `npm run site:build`: passed.
- `node scripts/verify-site.cjs` against the built preview: passed all production routes, v2.7.0 release links, metadata, robots policy, and the committed social image.
- JavaScript syntax checks for the website/readme/UI/branding studies: passed.
- Direct browser loading of website studies, branding, and README previews found no passive external requests or page errors.

The integrated `npm run test:ui` run passed 38 browser checks with zero page errors, including the companion flows, provider-report final-section scrolling, updated studies, keyboard behavior, platform limits, missing data, DNS, and the 1,000-network fixture. Native formatting, workspace check, and workspace tests passed on Windows: 4 desktop-host tests and 74 core tests passed, with 3 subprocess fixtures intentionally ignored during direct enumeration and exercised by their deadline test. macOS and Linux live hardware behavior, installers, and permission paths remain outside this local verification.

## Maintainer review before release

- The current Windows production before/after tray-memory run and short CPU/write observations are attached in `BENCHMARKS.md`; a controlled ten-minute battery run remains future evidence work, so no battery-life claim is made.
- Confirm the final browser suite passes provider-report scrolling at 320 × 200 and larger sizes.
- Confirm native commands/events, settings migrations, and all observation tests pass on the integrated commit.
- Exercise Windows, macOS, and Linux packages or their CI runners, documenting unavailable hardware permission checks.
- Review every public sentence against the shipped defaults and actual package availability.
