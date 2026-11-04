# NetMask release protocol

Repository: [billighost/netmask](https://github.com/billighost/netmask). Maintainer: **Bello Bilal**, `bb2010ng@gmail.com`.

Follow these seven steps in order. Releases use the Tauri host, pass local and multi-platform verification, merge through a pull request, and tag the merged commit on `main`. Never push changes directly to protected `main` or tag an unmerged feature commit.

## 1. Set the version and prepare notes

Choose a stable semantic version and synchronize every manifest and lockfile:

```sh
npm run version:set -- X.Y.Z
```

The helper updates `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, both Rust package manifests, and the two workspace package versions in `Cargo.lock`.

Update the latest version and all direct downloads in `README.md`. Write `docs/releases/vX.Y.Z.md` with concrete changes, supported architectures, direct downloads, and remaining platform limitations. Preserve the maintainer attribution and license.

The title bar, settings, tray, and updater read the Rust package version at runtime. Do not hardcode the release version into UI components.

## 2. Complete local verification

Run the mandatory frontend checks in this order:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

For interface changes, also run `npm run test:ui` after the frontend build. The browser fixture checks the implemented app and design studies at small and large sizes without changing a real network. It uses installed Edge on Windows or Playwright Chromium; `npx playwright install chromium` installs the latter when needed. CI runs this check and uploads screenshots.

Then verify the native workspace:

```sh
npm run format:native
npm run check:native
npm run test:native
```

Fix failures before committing or pushing. The hook scanner detects unsafe hook ordering; Node tests exercise actual frontend actions, persistence queues, and release-package validation. Native core tests use isolated storage, socket fixtures, and subprocess fixtures rather than changing a real network.

A missing system linker, webview development package, or platform runtime is an environment limitation, not a passing check. Document it and obtain a successful native check and core test result on the corresponding CI runner before merging. OS permission prompts, Wi-Fi reconnects, DNS mutations, and driver settings need a separate manual check on real hardware.

For native changes, also build the host installers with `npm run dist:win`, `npm run dist:mac`, or `npm run dist:linux` where the relevant build toolchain is installed. Installer compilation on all four release runners is mandatory before publication.

## 3. Create and push the release branch

After verification:

```sh
git switch -c release/vX.Y.Z
git add <reviewed source, tests, docs, manifests, and assets>
git commit -m "chore(release): vX.Y.Z - <summary>"
git push -u origin release/vX.Y.Z
```

Review `git diff --cached` first. Do not commit installers, the native target directory, dependencies, local data, authentication material, or temporary browser artifacts.

## 4. Open, verify, and merge the pull request

Use GitHub CLI or `scripts/github-release.cjs`. The helper authenticates through `GH_TOKEN`, `GITHUB_TOKEN`, or Git Credential Manager without printing or saving credentials.

Create a temporary JSON file containing `title`, `head`, `base: "main"`, and a Markdown `body` that explains behavior, validation, and platform limits:

```sh
node scripts/github-release.cjs pr-create .tmp/release-pr.json
node scripts/github-release.cjs checks <exact-head-sha>
node scripts/github-release.cjs pr <pr-number>
```

Wait for **TypeScript Check** and every **Build** check on the current PR head to finish successfully. Native CI covers Windows, Apple silicon, Intel macOS, and Linux. Do not rely on checks from an older commit or merge while checks are pending.

```sh
node scripts/github-release.cjs pr-merge <pr-number> <verified-head-sha>
```

The required SHA guards against merging changes that arrived after review. Squash merge only after all required checks pass.

## 5. Tag the merged commit

Fetch the result, verify the PR's returned merge SHA, and advance local `main` with a fast-forward:

```sh
git fetch origin main
git switch main
git merge --ff-only origin/main
git tag -a vX.Y.Z -m "Release vX.Y.Z - <summary>"
git push origin vX.Y.Z
```

Before pushing, verify that the tag resolves to the merged commit and that `package.json` at that commit has version `X.Y.Z`.

## 6. Monitor native installer builds

The tag triggers `.github/workflows/release.yml`. Its first job checks the tag, package version, release notes, and ancestry on `origin/main`. Manual workflow dispatch must specify an existing version tag; it checks out that tag rather than the branch used to launch the workflow.

| Runner | Published native packages |
| --- | --- |
| `windows-latest` | `NetMask_X.Y.Z_x64-setup.exe`, `NetMask_X.Y.Z_x64_en-US.msi` |
| `macos-latest` | `NetMask_X.Y.Z_aarch64.dmg` |
| `macos-15-intel` | `NetMask_X.Y.Z_x64.dmg` |
| `ubuntu-latest` | `NetMask_X.Y.Z_amd64.deb`, `NetMask_X.Y.Z_amd64.AppImage` |

Each runner checks formatting, compiles the workspace, runs native core tests, and builds its installers. The publish job runs only after every runner succeeds. It requires exactly six non-empty native packages, rejects unexpected or duplicate files, and generates `checksums.txt`.

```sh
node scripts/github-release.cjs runs <merged-sha>
node scripts/github-release.cjs run <release-run-id>
node scripts/github-release.cjs logs <failed-job-id>
```

Wait for `completed` / `success`. If a release build fails, repair it through a new PR. Do not silently move a published tag to different code. A manual rerun is appropriate for a transient service failure when the tagged source remains unchanged.

## 7. Verify the release and download links

```sh
node scripts/github-release.cjs release vX.Y.Z
```

Check that the release is published, targets the merged tag, includes every package and `checksums.txt`, and contains the prepared release notes. Open or fetch the README's direct downloads and verify the exact filenames and architectures. The native updater selects the current platform's package and requires GitHub's SHA-256 asset digest before offering an in-app verified download; releases without a digest remain accessible from their release page.

The workflow publishes `docs/releases/vX.Y.Z.md` automatically. If notes need correcting:

```sh
node scripts/github-release.cjs release-edit vX.Y.Z docs/releases/vX.Y.Z.md
```

Historical compatibility-asset cleanup uses an exact reviewed plan:

```sh
node scripts/github-release.cjs release-asset-plan v2.2.0
node scripts/github-release.cjs release-asset-cleanup v2.2.0 .tmp/reviewed-assets.json
```

The helper requires all five original v2.2.0 native packages before deleting recognized compatibility assets. It compares the current IDs, names, and sizes with the reviewed JSON. File size alone must never decide what to delete: the native Linux AppImage is larger because it bundles dependencies.

Record the PR, merge SHA, tag, build results, and published asset verification in the audit notes or persistent project memory. Report what was actually verified and any remaining hardware checks.
