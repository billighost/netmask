const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const logos = require('../docs/branding/catalog.js')
const root = path.resolve(__dirname, '..')
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js')
const ids = new Set()
for (const logo of logos) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(logo.id) || ids.has(logo.id)) throw new Error(`Invalid or duplicate logo id: ${logo.id}`)
  ids.add(logo.id)
  const directory = path.join(root, 'docs/branding/logos', logo.id)
  fs.mkdirSync(directory, { recursive: true })
  const source = path.join(directory, 'mark.svg')
  const svg = shape => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 256 256">${shape}</svg>\n`
  fs.writeFileSync(source, svg(logo.shape))
  fs.writeFileSync(path.join(directory, 'mark-light.svg'), svg(logo.shape.replaceAll('#294e3f', '#edf1e9').replaceAll('#ba5c3c', '#e59370')))
  fs.writeFileSync(path.join(directory, 'mark-mono.svg'), svg(logo.shape.replaceAll('#ba5c3c', '#294e3f')))
  execFileSync(process.execPath, [cli, 'icon', source, '--output', directory], { stdio: 'pipe' })
  // This desktop app needs the desktop format set. Keep the gallery focused.
  for (const name of ['android', 'ios']) {
    const generated = path.resolve(directory, name)
    if (!generated.startsWith(directory + path.sep)) throw new Error('Generated icon cleanup escaped its option directory')
    if (fs.existsSync(generated)) fs.rmSync(generated, { recursive: true })
  }
  // Classic scripts can load beside a file:// gallery, where fetch is blocked.
  // Keep each pack separate so opening the gallery never loads icon binaries.
  const downloads = {}
  for (const [format, name, type] of [
    ['svg', 'mark.svg', 'image/svg+xml'],
    ['png', 'icon.png', 'image/png'],
    ['ico', 'icon.ico', 'image/x-icon'],
    ['icns', 'icon.icns', 'application/octet-stream']
  ]) {
    downloads[format] = { type, data: fs.readFileSync(path.join(directory, name)).toString('base64') }
  }
  fs.writeFileSync(path.join(directory, 'downloads.js'), `window.NETMASK_LOGO_DOWNLOADS ||= {};\nwindow.NETMASK_LOGO_DOWNLOADS[${JSON.stringify(logo.id)}] = ${JSON.stringify(downloads)};\n`)
  console.log(`${String(logos.indexOf(logo) + 1).padStart(2, '0')} ${logo.name}: color, light, and monochrome SVG; transparent PNG, ICO, ICNS, and Windows sizes`)
}
