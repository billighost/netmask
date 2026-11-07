# NetMask product strategy

## Positioning

**Know your connection. Control what you show.**

NetMask is an always-available, local-first desktop companion for people who want to understand how their connection behaved, prepare their screen for a call or broadcast, keep local network labels meaningful, and turn measured problems into evidence.

The name remains appropriate only when the product is explicit about its boundary: NetMask can change supported local labels and mask supported fields inside its own display. It does not mask internet identity, change a router's broadcast name, encrypt traffic, or make a user anonymous.

## Who it serves

- People troubleshooting unreliable calls, streams, games, and everyday internet access.
- Households and independent workers who want per-network observed usage without sending it to a service.
- Creators and presenters who need a deliberate pre-call check and a cleaner NetMask display.
- People who need a calm, readable provider report rather than a screenshot of unexplained numbers.
- Technical users who still value DNS comparison, adapter details, recovery, and transparent platform limits.

The product is not aimed at centralized fleet monitoring, router administration, provider billing reconciliation, packet inspection, surveillance, or security-incident detection.

## Product principles

1. **Measured over imagined.** Missing samples, unavailable fields, and thin coverage are shown plainly.
2. **Local and bounded.** Monitoring data stays on the device, has retention and row caps, can be paused, and can be deleted.
3. **Opt-in context.** Prompts, automation, monitoring, usage, and alerts begin only after a user choice.
4. **Reversible by design.** Original labels, preset previews, permission boundaries, recovery records, and undo are product features.
5. **Calm over noisy.** Alerts require confirmation, baselines, and cooldowns. A changed access point is described without an attack claim.
6. **Light enough to keep.** The tray hides the existing webview for seamless return; visible-only work stops, native background work follows reduced schedules, and Windows uses bounded working-set trim passes while hidden.
7. **Plain evidence.** Reports use measured history, redact identifiers by default, and explain alternative causes and coverage.
8. **Cross-platform honesty.** OS, adapter, driver, and permission limits appear in the interface rather than marketing footnotes.

## Core journeys

### Understand yesterday

A user enables the local journal, chooses retention, and later opens History to see drops, latency spikes, jitter, switches, and explicit gaps by time and saved network. The answer can be “there is not enough data.”

### Track a personal network limit

A user enables observed usage, sees upload/download totals tied to a saved network, and sets a personal cycle limit. Warnings occur once near and once after the limit. Copy always distinguishes these counters from provider billing and other devices.

### Prepare for a call or broadcast

A user chooses Going live. NetMask performs fresh connection and sign-in checks, turns on sharing mode, and returns ready, caution, not-ready, or unavailable evidence. Supported app detection can offer this flow but never bypasses the user's selected mode.

### Personalize a place

A user creates a network preset for a local label, Fieldnotes theme, and access-point display preference. They preview the changes, see permission requirements, choose ask or safe automatic application, and can undo.

### Review the week

A user opens This week for a short summary. Findings require coverage gates. A DNS suggestion can appear only when a user-run comparison on that network supports it; otherwise the digest stays descriptive or insufficient.

### Contact a provider

A user chooses a period and network, previews an HTML or Markdown provider report, and sees measurements, coverage, incidents, and caveats. Identifiers are redacted by default. Passwords are absent by construction.

## Retention without a heavy product

The return loop comes from useful local context, not engagement mechanics:

- the tray hides the intact renderer for seamless return, stops visible-only work, and keeps only opted-in native schedules active;
- the journal accumulates only after explicit consent;
- Going live provides a deliberate recurring action;
- weekly findings summarize rather than demand attention;
- alerts are exceptional, not a notification feed;
- presets make known networks feel consistent;
- evidence exports give history a practical purpose.

No telemetry is added to measure engagement. Product decisions use reproducible performance tests, issue reports, voluntary user feedback, and explicit usability studies with fictional or consented data.

## Success criteria

Release quality is evaluated with product evidence rather than remote analytics:

- cold start, tray close/open, and saved-state restoration work reliably;
- the measured tray footprint is materially lower than the reviewed pre-change build;
- monitoring stays within documented CPU, memory, disk, and request schedules;
- history never draws a line through a missing period;
- usage discontinuity fixtures never invent bytes;
- insufficient weekly coverage yields no confident conclusion;
- alerts remain below their confirmation and cooldown thresholds in noisy fixtures;
- provider reports match the preview, redact by default, and contain no credential path;
- all supported controls explain genuine OS unavailability;
- keyboard, screen-reader, both-theme, and 320 × 200 verification passes;
- existing label recovery and upgrade migrations remain intact.

Any performance criterion without a completed measurement remains unclaimed in public copy.

## Messaging system

Primary line:

> Know your connection. Control what you show.

Supporting description:

> A local-first desktop companion for connection history, observed data use, call readiness, measured evidence, display privacy, and reversible network labels.

Required boundary language:

- “Observed on this computer, not provider billing.”
- “Missing samples stay missing.”
- “Identifiers are redacted by default.”
- “Wi-Fi passwords are never included.”
- “Sharing mode changes NetMask's display; it is not anonymity.”
- “Your router keeps broadcasting its existing Wi-Fi name.”
- “A new access point can be normal on mesh or managed Wi-Fi.”

Avoid “protect your network,” “hide online,” “accurate bill,” “always ready,” “detect attacks,” or any fixed lightweight number that is not tied to a published measurement.

## Visual identity

Fieldnotes and the Orbit mark remain the product identity. Paper, forest green, terracotta, serif display type, fine dividers, and restrained motion support a calm field-journal metaphor. Orbit now represents a connection observed over time; the terracotta dot is one measured moment. It must not be described as an anonymity shield.

## Platform direction

Windows, macOS, and Linux remain the supported desktop platforms, with clear capability differences. Android may be described only as **coming soon**. There is no date, committed feature list, or promise of desktop parity. Replacing React or adding Android implementation is outside the current release.

## Near-term priorities

1. Complete and publish reproducible tray and background-resource measurements.
2. Finish cross-platform fixture and hardware verification for counters, context, and permissions.
3. Improve explanatory copy when OS data is unavailable without adding fallback guesses.
4. Keep report evidence and weekly findings understandable to non-technical users.
5. Observe alert usefulness through voluntary feedback before broadening categories or lowering thresholds.
6. Preserve the small tray menu and avoid background features that require the renderer to stay alive.

New cloud accounts, telemetry, remote history sync, provider scraping, router credential storage, and social engagement features are not part of this strategy.
