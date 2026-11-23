# NetMask mini mode — design preview

Open [index.html](index.html) in a browser. This standalone Fieldnotes study preserves **three activation placements** and **five floating-window designs** as interactive references. The production direction uses placement **2**, beside Overview and Journal, and makes all five designs selectable in Settings. Every production design also offers a tiny Wi-Fi-speed view.

| Placement | Location |
| --- | --- |
| 1 | Title bar, beside the window controls |
| 2 | Overview navigation, beside the sections (selected) |
| 3 | Connection tools, beside Going live and Check connection |

| Window | Direction |
| --- | --- |
| 1 | Fieldnote — warm paper and familiar Fieldnotes typography (suggested) |
| 2 | Ribbon — slim horizontal readout |
| 3 | Soft glass — translucent green card |
| 4 | Little dial — compact focal reading |
| 5 | Signal desk — dark, crisp instrument |

In the desktop preview, drag the window or use arrow keys (Shift moves farther). Right-click, press Shift+F10, or click the menu button to open its popover. The custom opacity and size sliders, metric choices, reset, pause, speed-check sample, and return to full NetMask work in the preview. The announcement's close button dismisses it permanently in this preview's local browser storage. Theme, selections, and appearance also persist. No external fonts or services are needed.

The readings use the fictional **Studio** network. Live traffic is distinct from internet speed-test capacity and the Wi-Fi link rate to the router. This browser study simulates an always-on-top desktop window; the production app uses a native window and real available readings. The study does not monitor, test, or modify your real network.

Run `node docs/mini-preview/verify.cjs` from the repository root to check all options and interactions and generate contact sheets:

- [Activation placements — Paper](placements-paper.png)
- [Window designs — Paper](widgets-paper.png)
- [Window designs — Dark](widgets-dark.png)
- [Desktop and customization](desktop-menu.png)

The verification uses the project's installed Playwright browser. It opens a temporary loopback server for the local files and stops it on completion. Screenshots are written only into this preview directory.
