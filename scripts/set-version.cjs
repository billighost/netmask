// Align every package and lockfile without creating a Git tag.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const version = process.argv[2]
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || '')) {
  throw new Error('Usage: npm run version:set -- X.Y.Z (a stable semantic version)')
}
const updates = new Map()
for (const file of ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json']) {
  const target = path.join(root, file)
  const data = JSON.parse(fs.readFileSync(target, 'utf8'))
  data.version = version
  if (file === 'package-lock.json') data.packages[''].version = version
  updates.set(target, JSON.stringify(data, null, 2) + '\n')
}
for (const file of ['src-tauri/Cargo.toml', 'src-tauri/core/Cargo.toml']) {
  const target = path.join(root, file)
  const current = fs.readFileSync(target, 'utf8')
  if (!/^version\s*=\s*"[^"]+"/m.test(current)) throw new Error(`Missing package version in ${file}`)
  updates.set(target, current.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`))
}
const lockPath = path.join(root, 'src-tauri/Cargo.lock')
const lock = fs.readFileSync(lockPath, 'utf8')
updates.set(lockPath, lock.replace(/(\[\[package\]\]\r?\nname = "(?:netmask|netmask-core)"\r?\nversion = ")[^"]+("\r?\n)/g, (_, before, after) => `${before}${version}${after}`))
for (const [file, contents] of updates) fs.writeFileSync(file, contents)
console.log(`Set npm, Tauri, and Rust versions to ${version}. Update README downloads and release notes before verification.`)
