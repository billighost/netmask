const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const pkg = JSON.parse(read('package.json'))
const config = JSON.parse(read('src-tauri/tauri.conf.json'))

test('release metadata agrees across npm, Rust, and the desktop bundle', () => {
  assert.equal(config.version, pkg.version)
  const lock = JSON.parse(read('package-lock.json'))
  assert.equal(lock.version, pkg.version)
  assert.equal(lock.packages[''].version, pkg.version)
  for (const file of ['src-tauri/Cargo.toml', 'src-tauri/core/Cargo.toml']) {
    assert.equal(read(file).match(/^version\s*=\s*"([^"]+)"/m)?.[1], pkg.version, file)
  }
  for (const name of ['netmask', 'netmask-core']) {
    const block = read('src-tauri/Cargo.lock').split('[[package]]').find(block => block.includes(`name = "${name}"`))
    assert.equal(block?.match(/^version = "([^"]+)"/m)?.[1], pkg.version, name)
  }
  assert.equal(pkg.author.name, 'Bello Bilal')
  assert.equal(pkg.author.email, 'bb2010ng@gmail.com')
  assert.equal(config.identifier, 'com.billighost.netmask')
})

test('the release workflow publishes only versioned native packages after verification', () => {
  assert.match(pkg.scripts.dev, /^tauri dev$/)
  assert.match(pkg.scripts.build, /^vite build$/)
  const workflow = read('.github/workflows/release.yml')
  assert.doesNotMatch(workflow, /electron-builder|legacy:|continue-on-error/)
  assert.match(workflow, /prepare-release\.cjs/)
  assert.match(workflow, /npm run test:native/)
  assert.match(workflow, /needs:.*build-release/)
  assert.match(read('README.md'), new RegExp(`releases/tag/v${pkg.version.replaceAll('.', '\\.')}`))
})

test('bundled branding and small-window defaults have usable assets', () => {
  const main = config.app.windows.find(window => window.label === 'main')
  assert.ok(main.resizable && main.minHeight <= 200 && main.minWidth <= 320)
  const branding = [...config.bundle.icon,
    config.bundle.windows.nsis.headerImage, config.bundle.windows.nsis.sidebarImage,
    config.bundle.windows.nsis.installerIcon, config.bundle.windows.nsis.uninstallerIcon,
    config.bundle.windows.wix.bannerPath, config.bundle.windows.wix.dialogImagePath,
    config.bundle.macOS.dmg.background]
  for (const file of branding) assert.ok(fs.statSync(path.join(root, 'src-tauri', file)).size > 0, file)
  assert.match(config.app.security.csp, /object-src 'none'/)
  assert.equal(config.bundle.windows.nsis.installMode, 'currentUser')
})

test('the Windows setup moves from progress to an explicit completion page', () => {
  assert.equal(config.bundle.windows.nsis.template, 'installer/installer.nsi')
  const template = read('src-tauri/installer/installer.nsi')
  const hooks = read('src-tauri/installer/hooks.nsh')
  assert.doesNotMatch(template, /MUI_FINISHPAGE_NOAUTOCLOSE/)
  assert.match(template, /Move directly to the completion page/)
  assert.match(hooks, /MUI_FINISHPAGE_TITLE "Installation complete"/)
  assert.match(hooks, /Click Finish to close Setup/)
  assert.match(hooks, /MUI_FINISHPAGE_RUN_TEXT "Launch NetMask now"/)
})

test('Windows updates keep aliases and avoid the maintenance and launch stalls', () => {
  const template = read('src-tauri/installer/installer.nsi')
  const hooks = read('src-tauri/installer/hooks.nsh')
  const updater = read('src-tauri/src/updater.rs')
  assert.match(updater, /\.args\(\["\/UPDATE", "\/P", "\/R"\]\)/)
  assert.match(hooks, /\$UpdateMode = 1[\s\S]*Goto netmask_uninstall_done[\s\S]*ExecWait .*--nm-uninstall/)
  assert.match(hooks, /MUI_HEADER_TEXT "Updating NetMask" "Keeping your network aliases, settings, and shortcuts\."/)
  const leave = template.slice(template.indexOf('Function PageLeaveReinstall'), template.indexOf('FunctionEnd', template.indexOf('Function PageLeaveReinstall')))
  assert.ok(leave.indexOf('$UpdateMode = 1') < leave.indexOf('${NSD_GetState}'), 'update mode must bypass dialog state and uninstall logic')
  assert.match(template, /Update in place and keep network aliases \(recommended\)/)
  assert.match(template, /UPGRADINGPRODUCTCODE=NetMaskUpdate/)
  assert.match(template, /Function FinishPageShow[\s\S]*Update complete[\s\S]*ShowWindow \$mui\.FinishPage\.ShowReadme \$\{SW_HIDE\}/)
  const launch = template.slice(template.indexOf('Function RunMainBinary'), template.indexOf('FunctionEnd', template.indexOf('Function RunMainBinary')))
  assert.match(launch, /ExecShell "open"/)
  assert.doesNotMatch(launch, /RunAsUser|ExecWait/)
})

test('partially restored Windows names stay visible and repairable', () => {
  const native = read('src-tauri/src/platform/windows.rs')
  const types = read('src-tauri/src/types.rs')
  const row = read('src/renderer/src/components/NetworkRow/NetworkRow.tsx')
  const editor = read('src/renderer/src/components/ActionPanel/ActionPanel.tsx')
  const permissions = read('src-tauri/src/privileged.rs')
  assert.match(types, /name_sync_pending: bool/)
  assert.match(native, /profile\.name != name[\s\S]*backup\.contains_key\(guid\)/)
  assert.match(native, /Another saved Wi-Fi profile already uses this label/)
  assert.match(row, /Name needs repair/)
  assert.match(editor, /nameSyncPending[\s\S]*restore the original to repair both/)
  assert.match(editor, /!net\?\.renamed && !net\?\.nameSyncPending/)
  assert.match(permissions, /fn helper_exit_code[\s\S]*fn helper_error/)
})

test('sharing mode blocks keyboard restoration from revealing a saved name', () => {
  const app = read('src/renderer/src/App.tsx')
  const restoreCase = app.slice(app.indexOf("case 'restoreOriginal':"), app.indexOf("case 'reconnectWifi':"))
  assert.match(restoreCase, /sharingModeActive\(state\.streamerStatus, state\.streamerBusy\)/)
  assert.doesNotMatch(restoreCase, /Restored original name.*originalName/)
})
