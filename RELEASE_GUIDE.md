# NetMask release protocol

Repository: [billighost/netmask](https://github.com/billighost/netmask). Maintainer: **Bello Bilal**, `bb2010ng@gmail.com`.

Follow these seven steps in order. Releases use the Tauri host, pass local and multi-platform verification, merge through a pull request, and tag the merged commit on `main`. Never push changes directly to protected `main` or tag an unmerged feature commit.

## 1. Set the version and prepare notes

Choose a stable semantic version and synchronize every manifest and lockfile:

```sh
npm run version:set -- X.Y.Z
```

The helper updates `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, both Rust package manifests, and the two workspace package versions in `Cargo.lock`.

Update the latest version and release-page download links in `README.md`. Write `docs/releases/vX.Y.Z.md` with concrete changes, intended architectures, direct downloads, and remaining platform limitations. Publication removes download rows for unavailable platforms and reports the actual installer availability. Preserve the maintainer attribution and license.

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

A missing system linker, webview development package, or platform runtime is an environment limitation, not a passing check. Document it and obtain successful workspace checks and tests on the corresponding CI runner before merging. Native tests cover both the core and desktop host; three subprocess fixtures are intentionally ignored in direct enumeration and invoked by a deadline test. OS permission prompts, Wi-Fi reconnects, DNS mutations, and driver settings need a separate manual check on real hardware.

For native changes, also build the host installers with `npm run dist:win`, `npm run dist:mac`, or `npm run dist:linux` where the relevant build toolchain is installed. Each published platform must pass its tests and installer compilation. A confirmed GitHub runner-allocation failure may leave that platform unavailable while verified platforms release.

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

Wait for **TypeScript Check** and **CI Gate** on the current PR head to succeed and every **Build** check to finish. Native CI covers workspace tests and installer compilation on Windows, Apple silicon, Intel macOS, and Linux. CI Gate runs even when a dependency fails or is skipped. It requires successful frontend checks and at least one successful platform, and accepts a cancelled platform only when it has no runner, no executed steps, and GitHub's explicit annotation that a hosted runner could not be acquired. Missing, pending, skipped, manually cancelled, or failed builds block the gate.

```sh
node scripts/github-release.cjs pr-merge <pr-number> <verified-head-sha>
```

The helper verifies that the PR is open, mergeable, targets main, and still has the reviewed SHA. It checks the current PR workflow and every named GitHub Actions result; only the narrowly verified runner-allocation exception above is allowed. Pending or failed commit statuses block the merge. The merge API's SHA guard protects against changes arriving during verification. Configure repository branch protection to require **CI Gate** when enforcing this policy for merges outside the helper.

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

Each runner checks formatting, compiles and tests the whole native workspace, and builds its installers. The publish job examines actual job results and capacity annotations. It publishes complete package sets from successful platforms when other platforms lack runners; any actual test/build failure, unexplained cancellation, skipped job, or incomplete package set blocks publication. At least one platform must succeed. Windows requires both EXE and MSI; Linux requires both DEB and AppImage. All four platforms produce six packages.

Publication generates `checksums.txt`, `availability.json`, and release notes listing only available downloads. Successful later retries merge existing verified packages, regenerate checksums and availability, and add the new platform links without moving the source tag. The publication automation comes from the workflow revision, while the app and original notes come from the requested immutable tag; this permits historical-tag recovery through an updated workflow.

```sh
node scripts/github-release.cjs runs <merged-sha>
node scripts/github-release.cjs run <release-run-id>
node scripts/github-release.cjs logs <failed-job-id>
```

Check the publication job and actual release assets. A partial release may be published even while the workflow conclusion reports the cancelled runner. If an application build fails, repair it through a new PR and version. Do not silently move a published tag to different code.

If a job was cancelled before receiving a runner, inspect GitHub's annotations before treating it as a code failure:

```sh
node scripts/github-release.cjs run-notices <release-run-id>
node scripts/github-release.cjs run-rerun-failed <release-run-id>
```

The original v2.3.0 run had successful source, Windows, and Linux jobs, but both Mac jobs were cancelled because GitHub could not acquire hosted runners. Its publication job correctly skipped the incomplete release. Rerunning failed jobs retains the successful packages and retries the missing jobs without changing the tag. Skipping Linux-only dependency installation on Windows and macOS is intentional; skipping a required build or test is not a successful release.

`.github/workflows/retry-release.yml` automatically reruns confirmed runner-allocation failures up to three workflow attempts. It retains successful jobs and refuses automatic retries of code/test failures. After the limit, rerun failed jobs manually or dispatch one missing platform from `main` using a temporary JSON file:

```json
{"ref":"main","inputs":{"tag_name":"vX.Y.Z","platform":"macos-arm64"}}
```

```sh
node scripts/github-release.cjs workflow-dispatch release.yml .tmp/retry-platform.json
```

Accepted platforms are `all`, `windows-x64`, `macos-arm64`, `macos-x64`, and `linux-x64`. The retry compiles the original tag and adds its installer only after successful checks. Manual permission-controlled hardware tests remain separate.

## 7. Verify the release and download links

```sh
node scripts/github-release.cjs release vX.Y.Z
```

Check that the release is published, targets the merged tag, includes every package declared available and `checksums.txt`, and contains accurate generated notes. For new releases, compare `availability.json` with the actual packages and verify the direct download URLs in the published notes. The README leads to this availability-aware release page. The native updater selects the current platform's package and requires GitHub's SHA-256 asset digest before offering an in-app verified download; a missing package is not offered.

The workflow derives the published notes from `docs/releases/vX.Y.Z.md` and removes unavailable download rows. If notes need correcting, preserve the generated availability statement and use a corrected notes file:

```sh
node scripts/github-release.cjs release-edit vX.Y.Z .tmp/corrected-release-notes.md
```

Historical compatibility-asset cleanup uses an exact reviewed plan:

```sh
node scripts/github-release.cjs release-asset-plan v2.2.0
node scripts/github-release.cjs release-asset-cleanup v2.2.0 .tmp/reviewed-assets.json
```

The helper requires all five original v2.2.0 native packages before deleting recognized compatibility assets. It compares the current IDs, names, and sizes with the reviewed JSON. File size alone must never decide what to delete: the native Linux AppImage is larger because it bundles dependencies.

Record the PR, merge SHA, tag, build results, and published asset verification in the audit notes or persistent project memory. Report what was actually verified and any remaining hardware checks.
