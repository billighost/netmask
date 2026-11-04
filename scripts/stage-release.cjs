const fs = require('node:fs')
const path = require('node:path')
const { nativePackages } = require('./release-assets.cjs')
const [platform, destination] = process.argv.slice(2)
const expected = nativePackages(require('../package.json').version)[platform]
if (!expected || !destination) throw new Error('Usage: stage-release.cjs <platform> <output-directory>')
const root = path.resolve(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle')
function find(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? find(file) : entry.isFile() && expected.includes(entry.name) ? [file] : []
  })
}
const files = find(root)
for (const name of expected) {
  if (files.filter(file => path.basename(file) === name).length !== 1) throw new Error(`Expected exactly one native package: ${name}`)
}
fs.mkdirSync(destination, { recursive: true })
for (const file of files) fs.copyFileSync(file, path.join(destination, path.basename(file)))
console.log(`Staged ${files.length} native packages for ${platform}.`)
