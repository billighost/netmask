# Contributing to NetMask

NetMask is a Tauri 2 desktop app with a Rust host and a React / TypeScript interface. Bug fixes, accessibility improvements, and carefully tested operating-system integrations are welcome.

## Set up

Install Node.js 22.12+, Rust 1.90+, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. Windows requires the Visual Studio C++ toolchain and WebView2. Linux builds need WebKitGTK 4.1, an AppIndicator development package, librsvg, and patchelf.

```sh
git clone https://github.com/billighost/netmask.git
cd netmask
npm ci
npm run dev
```

`npm run vite:dev` starts the frontend server only; native features require the Tauri app. The standalone [UI studies](docs/ui-preview/index.html) can be opened directly in a browser.

## Where changes belong

| Path | Responsibility |
| --- | --- |
| `src-tauri/src/lib.rs` | App lifecycle, tray, and visibility-aware workers |
| `src-tauri/src/commands.rs` | Tauri command boundary |
| `src-tauri/core` | Native engines independent of the desktop webview |
| `src-tauri/src/platform` | Windows, macOS, and Linux integrations |
| `src-tauri/src/settings.rs` | Validated storage, file locks, recovery, and migration |
| `src/renderer/src/bridge.ts` | Typed Tauri invoke calls and event subscriptions |
| `src/renderer/src/types.ts`, `env.d.ts` | Shared frontend contracts |
| `src/renderer/src/*-actions.ts` | Reusable operations and loading/error behavior |
| `src/renderer/src/components` | React components and accessible dialogs |
| `scripts` | Verification and release tooling |

See [architecture](docs/ARCHITECTURE.md) before changing command contracts or persistence.

## Implementation rules

- Keep hooks unconditional and before early returns. Keep modal focus, Escape, and focus restoration working.
- Use narrow Zustand subscriptions so a speed sample does not repaint unrelated controls.
- Perform blocking native work through `spawn_blocking`; bound external processes and network requests.
- Pass executable arguments directly. Escape platform literals deliberately and keep credentials out of logs and errors.
- Save recovery information before changing a network. Delete a recovery record only after a confirmed successful restore.
- Validate settings and backup imports. Use file locks around read-modify-write operations and atomic replacement for JSON.
- Resolve stable profile identifiers and the active interface. Do not assume an adapter is named `Wi-Fi` or show live details for unrelated saved profiles.
- Disable unsupported controls and preserve missing measurements as unavailable. Use measured values, not invented fallbacks.
- Use the Fieldnotes tokens, shared panels, and custom Select/Toggle/Popover controls. Explain complex values through a small information button and plain language.
- Regenerate the selected Orbit assets with `node scripts/apply-branding.cjs`; installer artwork uses `python scripts/generate-installer-assets.py` and requires Pillow.
- Keep main content, long text, menus, and dialogs usable at 320 × 200 and at larger sizes. Avoid adding multiple competing scroll containers.

## Verify and submit

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run format:native
npm run check:native
npm run test:native
```

After the frontend build, run `npm run test:ui`. It uses installed Edge on Windows or Playwright Chromium, fictional native IPC responses, and no live operating-system changes. Install Chromium with `npx playwright install chromium` when needed. CI also checks the app, all four studies, and the minimum window size.

Use `cargo fmt --manifest-path src-tauri/Cargo.toml --all` to apply Rust formatting. Add focused tests for meaningful failures or behavioral edge cases. Native fixtures must use isolated data and must not mutate the contributor's live network, registry, DNS, or credentials.

Create a branch, review the staged diff, and open a PR against `main`. Describe the problem, resulting behavior, checks run, and any OS or hardware testing still needed. CI must pass on the current head before merge. Releases follow [RELEASE_GUIDE.md](RELEASE_GUIDE.md).

Keep Bello Bilal's author attribution and the MIT license. Follow the [Code of Conduct](CODE_OF_CONDUCT.md); disclose vulnerabilities through [SECURITY.md](SECURITY.md).
