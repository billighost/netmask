# Security and installation integrity

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/billighost/netmask/security/advisories/new) or contact maintainer **Bello Bilal** at `bb2010ng@gmail.com`. Include the affected version, reproduction steps, impact, and any proposed fix. Keep credentials and personal network information out of public issues.

Security fixes target the current Tauri release. Historical packages are not evidence that an issue has been fixed; use the latest published release and its notes.

## Download and verify

Official packages are published at [billighost/netmask/releases](https://github.com/billighost/netmask/releases). The current workflow publishes native packages for Windows x64, both Mac architectures, and Linux x64 with `checksums.txt`.

Compare your download's SHA-256 with the manifest from the same release:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\NetMask_2.6.0_x64-setup.exe
```

```sh
sha256sum NetMask_2.6.0_amd64.deb       # Linux
shasum -a 256 NetMask_2.6.0_aarch64.dmg # macOS
```

Checksums detect changed or incomplete files; they do not replace publisher code signing. This project does not currently claim verified Windows publisher signing or macOS notarization. SmartScreen or Gatekeeper may warn about an unrecognized download. Verify the source and file before making your own installation decision; do not disable system protections globally.

## App behavior

- Name changes and DNS/driver settings may require operating-system permission. Canceled or failed operations report failure.
- Original network labels and preferences stay in per-user JSON. Unix storage is private to the account; JSON is not encrypted.
- QR sharing reads supported saved Wi-Fi credentials only when requested. A standard Wi-Fi QR code contains readable credentials and grants access to that network.
- Display-name masking and BSSID hiding change what the app or supported local labels show. They do not hide your device from the router or change the router's broadcast SSID.
- Update downloads use exact native assets from this repository's GitHub releases, HTTPS with restricted redirects, expected size, and GitHub's SHA-256 digest. The app opens only a verified installer and rechecks it before launch.

## Network requests

Visible diagnostics may send ICMP probes to the gateway and an internet target, and an HTTP connectivity probe to Microsoft's `msftconnecttest.com`. The explicit speed test downloads about 3 MB from `speed.cloudflare.com`. DNS benchmarks query public resolvers. Update checks and downloads contact GitHub and its release-asset hosts. These services receive the ordinary network information associated with those requests.

Visible diagnostic polling pauses in the tray. Process detection for enabled display-name automation continues locally. Operating-system permissions, wireless drivers, and desktop environments can limit available fields and controls; missing data is not replaced with invented security information.
