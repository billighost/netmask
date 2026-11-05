# NetMask product and launch plan

Prepared 2026-11-04 from the application and repository, and updated 2026-11-05 after the first product pass. Items marked implemented are present in the working tree for the next release. Pricing and launch ideas remain experiments, not market forecasts.

## Recommendation

Keep **NetMask**, the **Orbit** logo, and **Fieldnotes**. Sell the benefit of understanding and controlling the names and connection information on your own computer. Start with creators, developers who record tutorials, and remote workers who frequently share their screens. Expand into support and traveling users after observing repeat use.

The current application combines useful small tools, but network renaming alone is often a one-time task. Repeat adoption needs a clear recurring job: checking a connection before a call or recording, sharing guest Wi-Fi, or preparing a readable support report. A focused, dependable utility has a better chance of earning recommendations than a long feature list.

The strongest first demonstration is: **`HomeFiber_5G` → `Studio` → a private display name → restore**. Show that alongside understandable live measurements. Explain the platform behavior beside the demo: Windows network labels, macOS service names, and Linux NetworkManager connection names differ.

## Brand and message

| Element | Recommendation |
| --- | --- |
| Product | NetMask |
| Descriptor | A small desktop companion for your network |
| Main headline | Your networks. Your names. |
| Supporting line | Familiar names, readable connection checks, and control over what NetMask displays. |
| Visual identity | Orbit; paper and forest green; terracotta accents; serif network names; clear body text |
| Voice | Calm, specific, helpful; explain what an action changes before it runs |
| Main action | Download for Windows / macOS / Linux, with the correct architecture |
| Secondary action | Watch the 30-second demo |

Use the existing selected [Orbit master](branding/logos/orbit/mark.svg), not another set of competing logos. Keep screenshots, installer artwork, the site, and release graphics consistent with Fieldnotes. Use fictional network names and readings in every public asset.

Suggested landing-page copy for what exists today:

> **Your networks. Your names.**
>
> Give a network a familiar local name, check your connection, and use a private display name when you need it. NetMask keeps your originals so you can restore them.
>
> A small desktop app for Windows, macOS, and Linux. Your router keeps its Wi-Fi name. Available controls depend on your operating system.

Sharing mode changes the supported operating-system local label and immediately hides saved names, original labels, search/editor values, network IDs, device identity, adapter identity, access-point addresses, notifications, reports, and Wi-Fi sharing controls inside NetMask. It cannot protect another application's screen or make the connection anonymous. Process detection recognizes a running broadcast app, not an actual broadcast.

“NetMask” also sounds like a technical networking term. Always include the descriptor in search titles and store descriptions; check naming and domain availability before buying or registering anything.

## What to build next

| Priority | Feature | Status | Reason to use it again | Acceptance criteria |
| --- | --- | --- | --- | --- |
| 1 | App-wide screen-sharing mode | Implemented | Prepare NetMask for a call or recording immediately | Renderer masking covers saved names, original labels, search/editor values, device names, addresses, notifications and dialogs; QR codes and passwords require an explicit exit; masking begins before asynchronous OS work; built-in and validated custom executable detection plus persisted 15/30/60-minute sessions remain opt-in and uncluttered; scope is explained |
| 1 | Connection check with an exportable report | Implemented | Quickly explain whether Wi-Fi, the router, or internet response is struggling | HTML and Markdown use measured evidence and unavailable states, plain findings and next steps, exact preview, and default identifier redaction; Wi-Fi passwords are never exported |
| 1 | First-run guide and capability checklist | Implemented | Reach the first successful action without confusion | Offers “Name a network,” “Check my connection,” and “Prepare for sharing”; platform notes explain local naming and permissions; permission requests remain tied to explicit actions |
| 1 | Signing and dependable installers | In progress | Make installation and updating easier to trust | Install, upgrade, tray, startup, restore, and uninstall logic is covered; direct manual downloads remain available; publisher signing, notarization, and target-device checks still require release infrastructure |
| 2 | Connection history and call-quality trends | Proposed | Understand repeated drops or jitter over time | Store bounded local history; distinguish loss, latency, and missing samples; reset on connection changes; expose pause, retention, and delete controls |
| 2 | Tray quick actions | Implemented | Check a connection without opening a large window | Minimal menu provides Show NetMask, checked sharing-mode control, Run connection check, and Quit; the tooltip reflects sharing state; no expensive tray-only probe was added |
| 2 | User-controlled per-network presets | Proposed | Reuse familiar labels and display preferences | Key settings by stable identity; preview changes; keep recovery records; support partial failure without silent network changes |
| 3 | IPv6-aware DNS and custom resolvers | Proposed | Make advanced configuration useful and complete | Show which protocol and adapter are affected, retain both previous configurations, verify changes and rollback; avoid presenting one lookup sample as a universal recommendation |
| 3 | Team support templates | Validate first | Turn support work into a paid recurring use case | Validate with actual support teams before building policy deployment or account infrastructure |

The four approved product additions—sharing mode, reports, first-run guidance, and focused tray actions—are implemented without adding permanent dashboard clutter. Finish target-platform installer, signing, permission, rename/restore, and uninstall validation before adding more adapter tweaks, a VPN, an account system, or AI features.

## Pricing experiments

Keep the current MIT app free and usable. Renaming, restoring, basic diagnostics, and safe privacy behavior should remain accessible. Selling convenience and support is more credible than charging people to restore their own network labels.

Test these offers with 20–30 users who actually use the app:

- **Supporter:** a voluntary $9–19 one-time contribution, with transparent benefits and no claim that it unlocks existing MIT functionality.
- **NetMask Plus:** a $19–29 one-time price hypothesis for an eventual separately packaged set of history, report templates, and preset conveniences. Define updates, license scope, and support before taking payment.
- **Teams:** paid support or deployment assistance only after several teams ask for it. Price from observed support effort; do not build subscriptions first.

The existing MIT source can be redistributed. A paid offering must provide a reason to buy that survives redistribution, such as service, support, or additional functionality. No checkout, subscription, licensing change, or external publication was created in this audit.

## Launch sequence

**Days 1–14: prove installation and first value.** Recruit approximately 20 testers across the supported systems, initially emphasizing Windows because several controls are Windows-specific. Ask each person to install, rename and restore, check a connection, hide a display name, use the tray, and update. Record where they hesitate and whether they choose to use it again. Resolve installation and recovery failures before promotion.

Create one download page, one 30-second screen recording, and three screenshots: familiar-name editing, connection readings, and the existing display-privacy behavior. Label sample data. Put platform requirements, the actual signing status, a short permissions explanation, and GitHub release links near the download buttons.

**Days 15–30: launch to a narrow audience.** Publish the verified release and a concise changelog. Share the demo in communities for tutorials, streaming workflows, desktop utilities, and open-source software where promotion is allowed. Show the exact workflow rather than posting a generic feature list. Invite a few relevant creators to try the app through normal outreach; do not automate unsolicited messages. Track which demo and channel produce successful installs, not just views.

Once the package and update flow are stable, prepare Windows package-manager distribution, macOS distribution suitable for the actual signing status, and Linux package instructions. Treat submissions and store accounts as separate launch work. Evaluate a broader launch site only after the installation and first-use funnel works.

**Days 31–60: validate the retention features.** Test sharing mode and connection reports with the first cohort. Publish a specific before/after demonstration and a short tutorial. Measure whether people return to prepare for calls or create reports, and improve the wording or defaults before adding history.

**Days 61–90: test revenue and expand.** Offer the supporter experiment, interview repeat users about paid conveniences, and measure conversion. Expand to travelers and support teams if their workflows show stronger retention. Avoid paid acquisition until a release reliably installs and users return.

Suggested demo script:

1. Show an unfamiliar local label and rename it to “Studio.”
2. Point out current transfer activity and explain router response in one sentence.
3. Apply a private display name, with a visible statement of its scope.
4. Restore the previous name and show the download destination.

Suggested release-post opening:

> I built NetMask to make network names and connection checks easier to live with. Give a network a familiar local name, see what your connection is doing, and use a private display name when you need it. Originals stay recoverable. Here's the actual workflow in 30 seconds.

## Measure the funnel

| Measure | Definition | Decision it informs |
| --- | --- | --- |
| Download conversion | Download clicks / qualified download-page visits, grouped by OS | Whether the message and platform offer are clear |
| Installation success | Tester installs that reach a working app / attempted installs | Whether distribution is ready for broader promotion |
| Activation | Users who complete one useful action during first use / new users | Whether the guide and initial experience work |
| Repeat use | Activated users who return on a later day within a week | Whether there is a recurring job |
| Reliability | Failed operations, crash reports, restore failures and update failures | Which technical friction to address first |
| Paid conversion | Purchases / users shown a defined paid offer | Whether the offer merits further work |

Use download-page totals, GitHub asset counts, interviews, and voluntarily supplied reports first. If app analytics are introduced, make them opt-in, document retention, and never collect SSIDs, passwords, BSSIDs, MAC addresses, hostnames, process lists, or recovery records. Raw downloads are not unique users or retention.

Use the first cohort to establish baselines before setting conversion or revenue targets. A reasonable launch gate is that every tested supported-platform install/restore/update path works, there are no unresolved recovery failures, and testers can explain the app's scope. High adoption cannot be guaranteed; improve one measurable part of this funnel at a time.
