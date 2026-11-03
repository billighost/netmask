# Security Policy & Integrity Guide

## Supported Versions

We actively provide security patches and updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within NetMask, please **do not** report it in a public GitHub issue.

Instead, please send an encrypted or confidential disclosure to the maintainers via:
- GitHub Private Vulnerability Reporting: [Report a vulnerability](https://github.com/billighost/netmask/security/advisories/new)

Please include:
- A description of the issue and potential impact
- Detailed steps or a minimal proof-of-concept to reproduce the vulnerability
- Any proposed remediations or mitigations

You will receive an initial response within **48 hours**. We will coordinate a patched release and acknowledge your contribution responsibly.

---

## Windows SmartScreen & "Unknown Publisher" Notice

### Why does Windows show "Unknown Publisher"?
When you download and run a newly released executable on Windows, Microsoft Defender SmartScreen displays a warning:
> *"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."*

This is standard Windows behavior for open-source applications that:
1. **Have not yet accumulated high download volume reputation**: Microsoft SmartScreen requires hundreds or thousands of unique user downloads over time before automatically recognizing a binary hash as trusted.
2. **Are not signed with an expensive Extended Validation (EV) Hardware Token**: EV code signing certificates cost between $300 to $600 annually and require physical USB cryptographic keys, which is prohibitive for independent open-source projects.

### How to Safely Run NetMask
1. **Verify Integrity**: Compare the SHA-256 checksum of your downloaded installer against the `checksums.txt` file attached to the [GitHub Release](https://github.com/billighost/netmask/releases).
2. **Bypass SmartScreen Prompt**:
   - In the SmartScreen dialog, click **"More info"**.
   - Click **"Run anyway"**.
3. **PowerShell Unblock (Alternative)**:
   ```powershell
   Unblock-File -Path .\NetMask-Setup-2.0.0.exe
   ```
4. **Community & Automated Code Signing**:
   We are onboarding NetMask to [SignPath.io](https://about.signpath.io/), the non-profit code-signing service for open-source software, to provide free trusted signing in upcoming releases.
