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
