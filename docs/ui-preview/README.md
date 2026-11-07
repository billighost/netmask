# NetMask design studies

**Fieldnotes is the selected design system, with Orbit (logo 15).** It is implemented in the Tauri app. The other three studies remain as visual references.

Open [index.html](index.html) directly in a browser to explore the original studies. Adjust the height to 200 px, drag the preview corner, or [compare all four](compare.html).

| Direction | Approach | Status |
| --- | --- | --- |
| Fieldnotes | Warm paper, serif network names, green ink, fine dividers | Selected and implemented |
| Switchboard | Dark instrument panel, mint readouts, squared controls | Reference study |
| Tide | Blue connection surface, open spacing, soft controls | Reference study |
| Mono | Strong black type, orange notes, a rail in wider windows | Reference study |

The studies include fictional connection history, observed per-network usage, a Going live check, weekly findings, provider evidence, network presets, calm alerts, monitoring controls, profile selection, local label recovery, sharing mode, menus, connection details, DNS, device identity, keyboard help, and QR sharing. Their dropdowns and switches use custom styling; small information buttons explain technical values. Fieldnotes is the implemented design; the other directions demonstrate the same current product language as visual references.

All data and actions belong to the preview page. These pages do not invoke Tauri, monitor a real connection, change a network, or write a report. The QR code contains fictional guest credentials. No external fonts, libraries, or services are needed to open the studies.

The production interface has its own React components and native capability handling. Its shared dialogs trap and restore focus; one bounded scroll area keeps every action reachable at **320 × 200**. Custom popovers stay inside the viewport and support keyboard interaction.

Run `npm run build`, then `npm run test:ui` to verify the production interface and all four studies. The browser fixture replaces native commands with fictional responses; screenshots and results are written to `.tmp/ui-checks/`.

See [Orbit branding](../branding/README.md) and [architecture](../ARCHITECTURE.md) for the implemented sources.
